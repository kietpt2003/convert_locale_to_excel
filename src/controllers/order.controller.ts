import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import { AuthorizedUser } from '../models/AuthorizedUser.js';
import { Order } from '../models/Order.js';
import { PREMIUM_PLAN } from '../constants/premiumPlan.js';

export const handlePaypalSuccess = async (req: any, res: Response): Promise<any> => {
  try {
    const { id: userId } = req.user;
    const { usdAmount, paypalDetails, planType } = req.body;

    console.log('check body', req.body);


    // 1. Kiểm tra tính toàn vẹn của dữ liệu đầu vào
    if (!paypalDetails || !userId || !planType) {
      return res.status(400).json({
        success: false,
        message: "Missing required billing data fields."
      });
    }

    // 2. Tìm kiếm thông tin khách hàng dưới Database
    const user = await AuthorizedUser.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User registry not found in the system."
      });
    }

    // 3. Chống trùng lặp hóa đơn (Idempotency Check)
    const paypalOrderId = paypalDetails.id;
    const isOrderExist = await Order.findOne({ paypalOrderId });
    if (isOrderExist) {
      return res.status(400).json({
        success: false,
        message: "This PayPal transaction has already been processed and credited."
      });
    }

    const paypalCaptureId = paypalDetails.purchase_units[0].payments.captures[0].id;
    const payerEmail = paypalDetails.payer.email_address;
    const payerName = `${paypalDetails.payer.name.given_name} ${paypalDetails.payer.name.surname}`;

    // 4. LOGIC TÍNH TOÁN CỘNG DỒN NGÀY GIA HẠN
    const now = new Date();
    // Nếu gói cũ của khách vẫn còn hạn, ta lấy hạn cũ làm mốc tính tiếp, ngược lại lấy mốc thời gian hiện tại
    let baseDate = (user.premiumValidUntil && new Date(user.premiumValidUntil) > now)
      ? new Date(user.premiumValidUntil)
      : now;

    if (planType === "DAILY") {
      baseDate.setDate(baseDate.getDate() + 1);
    } else if (planType === "MONTHLY") {
      baseDate.setMonth(baseDate.getMonth() + 1);
    } else if (planType === "YEARLY") {
      baseDate.setFullYear(baseDate.getFullYear() + 1);
    }

    // 5. Đồng bộ cập nhật quyền hạn Premium mới vào User Model
    user.premiumPlan = planType;
    user.premiumValidUntil = planType === "LIFETIME" ? null : baseDate;
    await user.save();

    // 6. Lưu vết thông tin thanh toán vào bảng Order phục vụ đối soát tài chính
    const newOrder = new Order({
      userId,
      payerName,
      payerEmail,
      usdAmount,
      planType,
      paypalOrderId,
      paypalCaptureId
    });
    await newOrder.save();

    // 7. KÝ LẠI MÃ JWT TOKEN MỚI (Bao gồm đầy đủ thông tin cũ + quyền hạn Premium mới)
    const newToken = jwt.sign(
      {
        id: user._id.toString(),
        email: user.email,
        name: (user as any).name || "",       // Lấy thêm name phục vụ hiển thị avatar text
        picture: (user as any).picture || "", // Lấy thêm link ảnh từ DB ra ký lại
        role: user.role,
        premiumPlan: user.premiumPlan,        // Trạng thái gói mới mua
        premiumValidUntil: user.premiumValidUntil
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "1d" }
    );

    // Trả kết quả mỹ mãn về cho phía MobX Store bên Front-end thu nhận
    return res.status(200).json({
      success: true,
      message: `🎉 Dynamic access extended successfully to ${planType}!`,
      newToken
    });

  } catch (error: any) {
    console.error("Critical error inside handlePaypalSuccess controller:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during order capturing process.",
      error: error.message
    });
  }
};

export const handleActivatePlan = async (req: any, res: Response): Promise<any> => {
  try {
    const { planType } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Missing User ID from token payload."
      });
    }

    if (planType !== PREMIUM_PLAN.TRIAL) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan type for direct activation."
      });
    }

    const user = await AuthorizedUser.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found in system registration."
      });
    }

    if (user.hasUsedTrial) {
      return res.status(400).json({
        success: false,
        message: "You have already used your free trial. Please purchase a subscription plan!"
      });
    }

    // 3. TÍNH TOÁN THỜI HẠN DÙNG THỬ (7 ngày miễn phí)
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7); // Cộng thêm 7 ngày từ thời điểm hiện tại

    // 4. Đồng bộ cập nhật trạng thái vào Database
    user.premiumPlan = PREMIUM_PLAN.TRIAL;
    user.premiumValidUntil = expiryDate;
    user.hasUsedTrial = true; // Khóa chức năng dùng thử vĩnh viễn của tài khoản này
    await user.save();

    // 5. KÝ LẠI JWT TOKEN MỚI CHỨA QUYỀN HẠN TRIAL VỪA KÍCH HOẠT
    const newToken = jwt.sign(
      {
        id: user._id.toString(),
        email: user.email,
        name: (user as any).name || "",
        picture: (user as any).picture || "",
        role: user.role,
        premiumPlan: user.premiumPlan,        // Chuyển thành 'TRIAL'
        premiumValidUntil: user.premiumValidUntil, // Ngày hết hạn mới (7 ngày sau)
        hasUsedTrial: user.hasUsedTrial       // Gửi kèm cờ true để UI ẩn banner trial
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "1d" }
    );

    // Trả kết quả thành công rực rỡ về cho MobX Store
    return res.status(200).json({
      success: true,
      message: "🎉 Success! Your 7-day free trial has been activated.",
      newToken
    });

  } catch (error: any) {
    console.error("Critical error inside handleActivatePlan controller:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during trial activation process.",
      error: error.message
    });
  }
};
