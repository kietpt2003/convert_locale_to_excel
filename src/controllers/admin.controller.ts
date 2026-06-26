import { Request, Response } from 'express';
import dotenv from "dotenv";
import CryptoJS from 'crypto-js';

import { AuthorizedUser } from '../models/AuthorizedUser.js';
import { RedmineAccount } from '../models/RedmineAccount.js';
import { REDMINE_AUTHEN_ERROR } from '../constants/redmine.js';
import { PREMIUM_PLAN } from '../constants/premiumPlan.js';
import { USER_ROLE } from '../constants/const.js';

dotenv.config();

const ENCRYPT_SECRET = process.env.REDMINE_PWD_SECRET || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

export const getAdminInfo = async (_req: Request, res: Response) => {
  try {
    const users = await AuthorizedUser.find().sort({ createdAt: -1 });
    const adminEmail = ADMIN_EMAIL;

    const formattedUsers = users.map(u => ({
      id: u.id,
      email: u.email,
      role: u.email === adminEmail ? "super_admin" : u.role,
      createdAt: u.createdAt,
      isSuperAdmin: u.email === adminEmail,
      hasUsedTrial: u.hasUsedTrial,
      premiumPlan: u.premiumPlan,
      premiumValidUntil: u.premiumValidUntil,
      lastLoginAt: u.lastLoginAt
    }));

    res.json(formattedUsers);
  } catch (err) {
    res.status(500).json({ message: "Cannot get user list" });
  }
}

export const createAdmin = async (req: Request, res: Response) => {
  try {
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ message: "Email cannot empty" });

    const exists = await AuthorizedUser.exists({ email });
    if (exists) return res.status(400).json({ message: "Email existed" });

    await AuthorizedUser.create({ email, role: role || USER_ROLE.USER });
    res.json({ message: "Add user success" });
  } catch (err) {
    res.status(500).json({ message: "Create user failed." });
  }
}

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const targetEmail = req.params.email;
    const requesterEmail = (req as any).user.email;

    if (targetEmail === ADMIN_EMAIL) {
      return res.status(400).json({ message: "Cannot delete Super Admin" });
    }

    if (targetEmail === requesterEmail) {
      return res.status(400).json({ message: "Cannot remove your permisison. Please contact Super Admin or IT Support!" });
    }

    const targetUser = await AuthorizedUser.findOne({ email: targetEmail });
    if (!targetUser) {
      return res.status(404).json({ message: "User not found." });
    }

    if (targetUser.role === USER_ROLE.ADMIN && requesterEmail !== ADMIN_EMAIL) {
      return res.status(403).json({ message: "Only Super Admin can delete other admin!" });
    }

    await AuthorizedUser.deleteOne({ email: targetEmail });
    res.json({ message: "Delete user success" });
  } catch (err) {
    res.status(500).json({ message: "Delete user failed." });
  }
}

export const getRedmineUserInfo = async (req: Request, res: Response) => {
  try {
    if (!req.query?.email) {
      return res.status(403).json({ message: "Email required!" });
    }

    const account = await RedmineAccount.findOne({ username: req.query.email });

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    const decryptedBytes = CryptoJS.AES.decrypt(account?.password || "", ENCRYPT_SECRET);
    const plainPassword = decryptedBytes.toString(CryptoJS.enc.Utf8);

    if (!plainPassword) {
      throw new Error(REDMINE_AUTHEN_ERROR.DECRYPTION_FAILED);
    }

    let resData = account;
    resData.password = plainPassword;

    res.json(resData);
  } catch (error) {
    console.log('check error', error);

    res.status(500).json({ message: "Failed to get user info." });
  }
}

export const grantUserPremium = async (req: Request, res: Response): Promise<any> => {
  try {
    const requesterEmail = (req as any).user.email;
    const adminEmail = ADMIN_EMAIL;

    if (requesterEmail !== adminEmail) {
      return res.status(403).json({
        message: "🛡️ Access Denied. Only Super Admin can manually grant premium plans!"
      });
    }

    const { email, planType, days } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Target user email is required." });
    }

    const targetUser = await AuthorizedUser.findOne({ email });
    if (!targetUser) {
      return res.status(404).json({ message: "Target user registry not found." });
    }

    const selectedPlan = planType || PREMIUM_PLAN.TRIAL;
    const defaultDays = days || 7;

    const expiryDate = new Date();

    if (selectedPlan === PREMIUM_PLAN.LIFETIME) {
      targetUser.premiumValidUntil = null;
    } else if (selectedPlan === PREMIUM_PLAN.DAILY) {
      expiryDate.setDate(expiryDate.getDate() + (days || 1));
      targetUser.premiumValidUntil = expiryDate;
    } else if (selectedPlan === PREMIUM_PLAN.MONTHLY) {
      expiryDate.setMonth(expiryDate.getMonth() + (days || 1));
      targetUser.premiumValidUntil = expiryDate;
    } else if (selectedPlan === PREMIUM_PLAN.YEARLY) {
      expiryDate.setFullYear(expiryDate.getFullYear() + (days || 1));
      targetUser.premiumValidUntil = expiryDate;
    } else {
      expiryDate.setDate(expiryDate.getDate() + defaultDays);
      targetUser.premiumValidUntil = expiryDate;
      targetUser.hasUsedTrial = true;
    }

    targetUser.premiumPlan = selectedPlan;
    await targetUser.save();

    return res.json({
      message: `🎉 Successfully granted [${selectedPlan}] access to ${email}!`,
      data: {
        email: targetUser.email,
        premiumPlan: targetUser.premiumPlan,
        premiumValidUntil: targetUser.premiumValidUntil
      }
    });

  } catch (error: any) {
    console.error("Critical error inside grantUserPremium admin controller:", error);
    return res.status(500).json({
      message: "Internal server error during premium distribution process.",
      error: error.message
    });
  }
};

/**
 * =========================================================================
 * 👉 LOGIC MỚI: SỬA/XÓA GÓI CỦA 1 USER (HẠ CẤP VỀ GÓI THƯỜNG 'NONE')
 * =========================================================================
 */
export const revokeUserPremium = async (req: Request, res: Response): Promise<any> => {
  try {
    const requesterEmail = (req as any).user.email;
    const adminEmail = ADMIN_EMAIL;

    // 🔒 BẢO VỆ TỐI CAO: Chỉ Super Admin thực sự mới được phép thu hồi/hạ cấp gói VIP
    if (requesterEmail !== adminEmail) {
      return res.status(403).json({
        message: "🛡️ Access Denied. Only Super Admin can manually revoke premium plans!"
      });
    }

    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Target user email is required." });
    }

    // 1. Tìm kiếm User cần xóa gói trong hệ thống
    const targetUser = await AuthorizedUser.findOne({ email });
    if (!targetUser) {
      return res.status(404).json({ message: "Target user registry not found." });
    }

    // 2. Nếu user vốn dĩ đang là gói NONE thì báo luôn để đỡ ghi đè DB vô nghĩa
    if (targetUser.premiumPlan === PREMIUM_PLAN.NONE) {
      return res.status(400).json({ message: "This user already has no active premium plan (NONE)." });
    }

    // 3. Tiến hành xóa gói: chuyển premiumPlan về NONE và gán ngày hết hạn thành null
    targetUser.premiumPlan = PREMIUM_PLAN.NONE;
    targetUser.premiumValidUntil = null;

    // Lưu ý: Chúng ta GIỮ NGUYÊN trạng thái u.hasUsedTrial để tránh việc user 
    // lợi dụng việc bị xóa gói để vào bấm nút dùng thử (Trial) lại một lần nữa.

    await targetUser.save();

    return res.json({
      message: `🗑️ Successfully revoked premium plan from ${email}. Account tier downgraded to NONE!`,
      data: {
        email: targetUser.email,
        premiumPlan: targetUser.premiumPlan,
        premiumValidUntil: targetUser.premiumValidUntil
      }
    });

  } catch (error: any) {
    console.error("Critical error inside revokeUserPremium admin controller:", error);
    return res.status(500).json({
      message: "Internal server error during premium revocation process.",
      error: error.message
    });
  }
};
