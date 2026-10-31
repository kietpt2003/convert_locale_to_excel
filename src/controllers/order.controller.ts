import { Response } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { AuthorizedUser } from '../models/AuthorizedUser.js';
import { Order } from '../models/Order.js';
import { PREMIUM_PLAN } from '../constants/premiumPlan.js';
import { PAYMENT_METHOD } from '../constants/order.js';
import { createOfflinePurchase } from './subscription.controller.js';

// Keep controller export compatibility while using verified checkout handlers.
export { capturePaypalPurchase as handlePaypalSuccess, confirmBankPurchase as handleSePayWebhook,
  subscriptionOrderStatus as checkOrderStatus } from './subscription.controller.js';
export const createSePayQROrder = createOfflinePurchase(PAYMENT_METHOD.SE_PAY);

dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET || '';

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

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7);

    user.premiumPlan = PREMIUM_PLAN.TRIAL;
    user.premiumValidUntil = expiryDate;
    user.hasUsedTrial = true;
    await user.save();

    const newToken = jwt.sign(
      {
        id: user._id.toString(),
        email: user.email,
        name: (user as any).name || "",
        picture: (user as any).picture || "",
        role: user.role,
        premiumPlan: user.premiumPlan,
        premiumValidUntil: user.premiumValidUntil,
        hasUsedTrial: user.hasUsedTrial
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

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

/**
 * API: Lấy danh sách lịch sử đơn hàng của User (Có phân trang)
 * Route: GET /api/orders
 * Security: Yêu cầu đi qua middleware verifyToken
 */
export const getListOrders = async (req: any, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Missing User ID."
      });
    }

    // 1. Lấy cấu hình phân trang từ query string, thiết lập giá trị mặc định
    // Ví dụ URL: /api/orders?page=1&limit=10
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    // Tính toán số lượng document cần bỏ qua (skip)
    const skip = (page - 1) * limit;

    // 2. Định nghĩa điều kiện truy vấn: Chỉ lấy đơn của user hiện tại
    const query = { userId };

    // 3. Thực thi Query song song để tối ưu hiệu năng (Lấy data & Đếm tổng số)
    const [orders, totalItems] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1 }) // -1: Sắp xếp giảm dần (Đơn mới nhất lên đầu)
        .skip(skip)
        .limit(limit)
        .lean(), // Dùng .lean() giúp Mongoose trả về plain JSON object, tăng tốc độ query

      Order.countDocuments(query)
    ]);

    // 4. Tính toán các thông số phân trang
    const totalPages = Math.ceil(totalItems / limit);

    // 5. Trả kết quả về cho Client
    return res.status(200).json({
      success: true,
      message: "Lấy danh sách lịch sử giao dịch thành công.",
      data: orders,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });

  } catch (error: any) {
    console.error("Lỗi khi lấy danh sách đơn hàng:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra trong quá trình truy xuất lịch sử đơn hàng.",
      error: error.message
    });
  }
};
