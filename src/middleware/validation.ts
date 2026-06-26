import { Request, Response } from "express";
import jwt from "jsonwebtoken";

import { CustomJwtPayload, UPDATE_COOLDOWN_SECONDS, USER_ROLE } from "../constants/const.js";
import { getRedisClient } from "../index.js";
import { AuthorizedUser } from "../models/AuthorizedUser.js";

export const verifyAdmin = (req: Request, res: Response, next: any) => {
  const user = (req as any).user;
  if (!user || (user.role !== USER_ROLE.ADMIN && user.role !== USER_ROLE.SUPER_ADMIN)) {
    return res.status(403).json({ message: "Access denied." });
  }
  next();
};

export const verifyToken = (req: Request, res: Response, next: any) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as CustomJwtPayload;
    (req as any).user = decoded;

    if (decoded.id) {
      const userId = decoded.id;

      (async () => {
        try {
          const redis = await getRedisClient();
          const cacheKey = `user_active_cooldown:${userId}`;

          const isCoolingDown = await redis.get(cacheKey);

          if (!isCoolingDown) {
            await redis.set(cacheKey, 'active_cooldown_val', { EX: UPDATE_COOLDOWN_SECONDS });

            await AuthorizedUser.findByIdAndUpdate(userId, { lastLoginAt: new Date() });
          }
        } catch (error) {
          console.error(`[Background Task] Lỗi update lastLoginAt cho user ${userId}:`, error);
        }
      })();
    }

    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid token" });
  }
};