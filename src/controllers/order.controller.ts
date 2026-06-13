import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from "dotenv";

import { AuthorizedUser } from '../models/AuthorizedUser.js';
import { Order } from '../models/Order.js';
import { PREMIUM_PLAN } from '../constants/premiumPlan.js';
import { ORDER_STATUS, PAYMENT_METHOD } from '../constants/order.js';

dotenv.config();

const SEPAY_WEBHOOK_SECRET = process.env.SEPAY_WEBHOOK_SECRET || '';
const TPBANK_NUMBER = process.env.TPBANK_NUMBER || '';
const JWT_SECRET = process.env.JWT_SECRET || '';

export const handlePaypalSuccess = async (req: any, res: Response): Promise<any> => {
  try {
    const { id: userId } = req.user;
    const { usdAmount, paypalDetails, planType } = req.body;

    if (!paypalDetails || !userId || !planType) {
      return res.status(400).json({
        success: false,
        message: "Missing required billing data fields."
      });
    }

    const user = await AuthorizedUser.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User registry not found in the system."
      });
    }

    const paypalOrderId = paypalDetails.id;
    const isOrderExist = await Order.findOne({ orderId: paypalOrderId });
    if (isOrderExist) {
      return res.status(400).json({
        success: false,
        message: "This PayPal transaction has already been processed and credited."
      });
    }

    const paypalCaptureId = paypalDetails.purchase_units[0].payments.captures[0].id;
    const payerEmail = paypalDetails.payer.email_address;
    const payerName = `${paypalDetails.payer.name.given_name} ${paypalDetails.payer.name.surname}`;

    const now = new Date();
    let baseDate = (user.premiumValidUntil && new Date(user.premiumValidUntil) > now)
      ? new Date(user.premiumValidUntil)
      : now;

    if (planType === PREMIUM_PLAN.DAILY) {
      baseDate.setDate(baseDate.getDate() + 1);
    } else if (planType === PREMIUM_PLAN.MONTHLY) {
      baseDate.setMonth(baseDate.getMonth() + 1);
    } else if (planType === PREMIUM_PLAN.YEARLY) {
      baseDate.setFullYear(baseDate.getFullYear() + 1);
    }

    user.premiumPlan = planType;
    user.premiumValidUntil = planType === PREMIUM_PLAN.LIFETIME ? null : baseDate;
    await user.save();

    const newOrder = new Order({
      userId,
      userName: payerName,
      userEmail: payerEmail,
      amount: usdAmount,
      planType,
      orderId: paypalOrderId,
      paypalCaptureId,
      paymentMethod: PAYMENT_METHOD.PAYPAL,
      status: ORDER_STATUS.COMPLETE
    });
    await newOrder.save();

    const newToken = jwt.sign(
      {
        id: user._id.toString(),
        email: user.email,
        name: (user as any).name || "",
        picture: (user as any).picture || "",
        role: user.role,
        premiumPlan: user.premiumPlan,
        premiumValidUntil: user.premiumValidUntil
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

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

export const handleSePayWebhook = async (req: Request, res: Response): Promise<any> => {
  try {
    const signature = (req.headers['x-sepay-signature'] as string) || '';
    const timestamp = (req.headers['x-sepay-timestamp'] as string) || '';
    const payload = JSON.stringify(req.body);

    const expected = 'sha256=' + crypto
      .createHmac('sha256', SEPAY_WEBHOOK_SECRET)
      .update(timestamp + '.' + payload)
      .digest('hex');

    if (signature !== expected) {
      console.error('[SePay Webhook] Cảnh báo: Chữ ký giả mạo hoặc không hợp lệ!');
      return res.status(401).send('Invalid signature');
    }

    const { content, transferAmount } = req.body;
    console.log(`[SePay Webhook] Xác thực chuẩn! Nhận giao dịch: "${content}" - Số tiền: ${transferAmount} VND`);

    // 👉 ĐÃ SỬA REGEX: Bắt đúng chuỗi dính liền MYONLYTOOL + D/M/Y/L + UUID (không có dấu -)
    const match = content.match(/(MYONLYTOOL[DMYL][A-Z0-9]+)/i);
    if (!match) {
      return res.status(200).json({ success: true, message: "Cú pháp không thuộc luồng tự động." });
    }

    const orderCode = match[1].toUpperCase();

    const order = await Order.findOne({ orderId: orderCode });
    if (!order) {
      return res.status(404).json({ success: false, message: "Hóa đơn không tồn tại trên hệ thống." });
    }

    if (order.status === ORDER_STATUS.COMPLETE) {
      return res.status(200).json({ success: true, message: "Đơn hàng này đã được kích hoạt trước đó." });
    }

    const user = await AuthorizedUser.findById(order.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Không tìm thấy User sở hữu đơn hàng." });
    }

    const now = new Date();
    let baseDate = (user.premiumValidUntil && new Date(user.premiumValidUntil) > now)
      ? new Date(user.premiumValidUntil)
      : now;

    if (order.planType === PREMIUM_PLAN.DAILY) baseDate.setDate(baseDate.getDate() + 1);
    else if (order.planType === PREMIUM_PLAN.MONTHLY) baseDate.setMonth(baseDate.getMonth() + 1);
    else if (order.planType === PREMIUM_PLAN.YEARLY) baseDate.setFullYear(baseDate.getFullYear() + 1);

    user.premiumPlan = order.planType;
    user.premiumValidUntil = order.planType === PREMIUM_PLAN.LIFETIME ? null : baseDate;
    await user.save();

    order.paypalCaptureId = "COMPLETED";
    order.status = ORDER_STATUS.COMPLETE;
    await order.save();

    return res.status(200).json({
      success: true,
      message: `🎉 Kích hoạt thành công gói [${order.planType}] cho User: ${user.email}!`
    });

  } catch (error: any) {
    console.error("Lỗi nghiêm trọng tại SePay Webhook Controller:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const checkOrderStatus = async (req: any, res: Response): Promise<any> => {
  try {
    const { orderCode } = req.params;
    const userId = req.user?.id;

    const order = await Order.findOne({ orderId: orderCode, userId });
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    if (order.status === ORDER_STATUS.COMPLETE) {
      const user = await AuthorizedUser.findById(userId);

      const newToken = jwt.sign(
        {
          id: user!._id.toString(),
          email: user!.email,
          name: (user as any).name || "",
          picture: (user as any).picture || "",
          role: user!.role,
          premiumPlan: user!.premiumPlan,
          premiumValidUntil: user!.premiumValidUntil
        },
        JWT_SECRET,
        { expiresIn: "1d" }
      );

      return res.status(200).json({
        success: true,
        status: "COMPLETED",
        newToken
      });
    }

    return res.status(200).json({
      success: true,
      status: "PENDING"
    });

  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const createSePayQROrder = async (req: any, res: Response): Promise<any> => {
  try {
    const userId = req.user?.id;
    const { planType, amount } = req.body;

    if (!planType || !amount) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp đầy đủ loại gói và số tiền thanh toán."
      });
    }

    const BANK_ID = "TPBank";

    const existingPendingOrder = await Order.findOne({
      userId,
      status: ORDER_STATUS.PENDING,
      paymentMethod: PAYMENT_METHOD.SE_PAY
    });

    if (existingPendingOrder) {
      const oldOrderCode = existingPendingOrder.orderId;
      const oldMemo = `Thanh toan don hang ${oldOrderCode}`;
      const oldAmount = existingPendingOrder.amount;

      const oldQrUrl = `https://qr.sepay.vn/img?bank=${BANK_ID}&acc=${TPBANK_NUMBER}&template=compact&amount=${oldAmount}&des=${encodeURIComponent(oldMemo)}`;

      return res.status(200).json({
        success: true,
        isExisting: true,
        message: "⚠️ Bạn đang có một hóa đơn chờ thanh toán trước đó. Vui lòng hoàn thành hoặc chờ hệ thống hủy đơn cũ!",
        qrUrl: oldQrUrl,
        memo: oldMemo,
        orderCode: oldOrderCode,
        planType: existingPendingOrder.planType
      });
    }

    // 👉 ĐÃ SỬA: Ép mã gói về 1 ký tự để rút ngắn tối đa độ dài chuỗi
    let planLetter = "X";
    if (planType === PREMIUM_PLAN.DAILY) planLetter = "D";
    else if (planType === PREMIUM_PLAN.MONTHLY) planLetter = "M";
    else if (planType === PREMIUM_PLAN.YEARLY) planLetter = "Y";
    else if (planType === PREMIUM_PLAN.LIFETIME) planLetter = "L";

    // 👉 ĐÃ SỬA: Xóa toàn bộ dấu '-' và cắt lấy 11 ký tự để an toàn tuyệt đối với ngân hàng
    const guuid = crypto.randomUUID().replace(/-/g, '').substring(0, 11).toUpperCase();

    // Sinh mã liền mạch không có dấu gạch ngang (VD: MYONLYTOOLM123E4567E89)
    const newOrderCode = `MYONLYTOOL${planLetter}${guuid}`;
    const newMemo = `Thanh toan don hang ${newOrderCode}`;

    const newOrder = new Order({
      userId,
      userName: "SePay Customer",
      userEmail: req.user?.email || "guest@email.com",
      amount: amount,
      planType,
      orderId: newOrderCode,
      paypalCaptureId: "PENDING",
      paymentMethod: PAYMENT_METHOD.SE_PAY,
      status: ORDER_STATUS.PENDING
    });
    await newOrder.save();

    const newQrUrl = `https://qr.sepay.vn/img?bank=${BANK_ID}&acc=${TPBANK_NUMBER}&template=compact&amount=${amount}&des=${encodeURIComponent(newMemo)}`;

    return res.status(200).json({
      success: true,
      isExisting: false,
      message: "Khởi tạo mã hóa đơn VietQR thành công!",
      qrUrl: newQrUrl,
      memo: newMemo,
      orderCode: newOrderCode,
      planType
    });

  } catch (error: any) {
    console.error("Lỗi khởi tạo đơn hàng SePay VietQR:", error);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra trong quá trình thiết lập hóa đơn ngoại tuyến.",
      error: error.message
    });
  }
};
