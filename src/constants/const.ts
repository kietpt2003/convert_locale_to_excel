import { JwtPayload } from "jsonwebtoken";

export const IGNORE_ENDPOINT = [
  "/api/stats/visits",
  "/api/convert-key/blob-token",
  "/assets/avatar.JPG",
  "/api/stats/total-usage"
];

export const USER_ROLE = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  USER: 'user'
};

export const UPDATE_COOLDOWN_SECONDS = 5 * 60;

export interface CustomJwtPayload extends JwtPayload {
  id: string;
  email: string;
  name: string;
  picture?: string;
  role: string;
  premiumPlan: string;
  premiumValidUntil?: Date,
  hasUsedTrial: boolean;
}
