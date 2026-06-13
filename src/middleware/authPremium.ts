import { Request, Response, NextFunction } from "express";

import { AuthorizedUser } from "../models/AuthorizedUser.js";
import { PREMIUM_ERROR, PREMIUM_PLAN } from "../constants/premiumPlan.js";
import { USER_ROLE } from "../constants/const.js";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

interface TokenPayload {
  id?: string;
  email: string;
  role: string;
}

interface CustomRequest extends Request {
  user?: TokenPayload;
}

export const checkPremiumAccess = async (
  req: CustomRequest,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Missing User ID from token payload."
      });
    }

    const user = await AuthorizedUser.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found in system registration."
      });
    }

    // 0. Trường hợp Super Admin -> Vượt qua gác cổng luôn
    const adminEmail = ADMIN_EMAIL;
    if (user.email === adminEmail || user.role === USER_ROLE.SUPER_ADMIN) {
      return next();
    }

    // 1. Trường hợp Gói Vĩnh viễn (LIFETIME) -> Vượt qua gác cổng luôn
    if (user.premiumPlan === PREMIUM_PLAN.LIFETIME) {
      return next();
    }

    // 2. Trường hợp Các gói có thời hạn (TRIAL, DAILY, MONTHLY, YEARLY)
    if (user.premiumPlan && user.premiumPlan !== PREMIUM_PLAN.NONE) {
      const now = new Date();

      // Kiểm tra xem hạn dùng của gói đã quá thời điểm hiện tại hay chưa
      if (user.premiumValidUntil && new Date(user.premiumValidUntil) > now) {
        return next(); // Gói còn hạn hiệu lực -> Cho phép đi tiếp vào controller tính năng
      } else {
        // Đã QUÁ HẠN -> Tự động hạ cấp trạng thái tài khoản ngay trong Database về NONE
        user.premiumPlan = PREMIUM_PLAN.NONE;
        user.premiumValidUntil = null;
        await user.save();
      }
    }

    // 3. Không có quyền truy cập (Người dùng thường hoặc Gói dịch vụ đã hết hạn)
    return res.status(403).json({
      success: false,
      result: PREMIUM_ERROR.PREMIUM_REQUIRED,
      message: "👑 VIP Feature Locked! Please subscribe to our Daily, Monthly, Yearly, or Lifetime plan to unlock access.",
      currentPlan: user.premiumPlan
    });

  } catch (error: any) {
    console.error("Error inside checkPremiumAccess middleware:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during premium verification.",
      error: error.message
    });
  }
};