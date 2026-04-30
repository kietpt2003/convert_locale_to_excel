import mongoose from "mongoose";

const authorizedUserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  role: { type: String, enum: ["admin", "user"], default: "user" },
  createdAt: { type: Date, default: Date.now }
});

export const AuthorizedUser = mongoose.model("AuthorizedUser", authorizedUserSchema);
