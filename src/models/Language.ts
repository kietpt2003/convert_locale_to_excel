import mongoose from "mongoose";

const languageSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

export const Language = mongoose.model("Language", languageSchema);