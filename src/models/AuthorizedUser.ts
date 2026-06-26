import mongoose from "mongoose";

import { PREMIUM_PLAN } from "../constants/premiumPlan.js";

const authorizedUserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  role: { type: String, enum: ["super_admin", "admin", "user"], default: "user" },
  premiumPlan: {
    type: String,
    enum: [PREMIUM_PLAN.NONE, PREMIUM_PLAN.TRIAL, PREMIUM_PLAN.DAILY, PREMIUM_PLAN.MONTHLY, PREMIUM_PLAN.YEARLY, PREMIUM_PLAN.LIFETIME],
    default: PREMIUM_PLAN.NONE
  },
  premiumValidUntil: {
    type: Date,
    default: null
  },
  hasUsedTrial: {
    type: Boolean,
    default: false
  },
  lastLoginAt: {
    type: Date,
    default: null
  },
  createdAt: { type: Date, default: Date.now },
});

export const AuthorizedUser = mongoose.model("AuthorizedUser", authorizedUserSchema);
