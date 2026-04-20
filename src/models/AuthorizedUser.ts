import mongoose from "mongoose";

const authorizedUserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  role: { type: String, enum: ["admin", "user"], default: "user" },
  redmineApiKey: { type: String, default: "" },
  redmineUrl: { type: String, default: "" },
  watchedProjectIds: { type: [String], default: [] },
  namingTemplate: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});

export const AuthorizedUser = mongoose.model("AuthorizedUser", authorizedUserSchema);