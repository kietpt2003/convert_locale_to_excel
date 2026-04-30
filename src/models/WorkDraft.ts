import mongoose from "mongoose";
import { WORK_DRAFT_STATUS } from "../constants/redmine.js";

const workDraftSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'AuthorizedUser', required: true },
  subject: { type: String, required: true }, // Nội dung công việc
  hours: { type: Number, required: true },   // Số giờ làm
  spentOn: { type: String, required: true }, // Ngày làm (YYYY-MM-DD)
  activityId: { type: Number, required: true },
  comments: { type: String },
  status: { type: String, enum: [WORK_DRAFT_STATUS.PENDING, WORK_DRAFT_STATUS.COMPLETED], default: 'PENDING' },
  createdAt: { type: Date, default: Date.now }
});

export const WorkDraft = mongoose.model("WorkDraft", workDraftSchema);