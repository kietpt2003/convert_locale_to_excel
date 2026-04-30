import { Response } from 'express';
import { WorkDraft } from '../models/WorkDraft.js';
import { AuthorizedUser } from '../models/AuthorizedUser.js';
import { WORK_DRAFT_STATUS } from '../constants/redmine.js';
import axios from 'axios';

// 1. LẤY DANH SÁCH BẢN NHÁP (Chưa xử lý)
export const getDrafts = async (req: any, res: Response) => {
  try {
    // Tìm user hiện tại đang login
    const user = await AuthorizedUser.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Lấy các bản nháp PENDING và xếp ngày mới nhất lên đầu
    const drafts = await WorkDraft.find({ userId: user._id, status: WORK_DRAFT_STATUS.PENDING }).sort({ spentOn: -1 });

    res.json({ success: true, data: drafts });
  } catch (error: any) {
    console.error("Fail to get drafts:", error.message);
    res.status(500).json({ success: false, message: "Fail to get drafts" });
  }
};

// 2. TẠO BẢN NHÁP MỚI
export const createDraft = async (req: any, res: Response) => {
  try {
    const { subject, hours, spentOn, activityId, comments } = req.body;

    // Validate dữ liệu đầu vào
    if (!subject || !hours || !spentOn || !activityId) {
      return res.status(400).json({ success: false, message: "Please fill in the Subject, Hours, Date and select activity." });
    }

    const user = await AuthorizedUser.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Lưu vào Database
    const newDraft = new WorkDraft({
      userId: user._id,
      subject,
      hours: Number(hours),
      spentOn,
      activityId: Number(activityId),
      comments: comments || "",
    });
    await newDraft.save();

    res.status(201).json({ success: true, data: newDraft });
  } catch (error: any) {
    console.error("Fail to create draft:", error.message);
    res.status(500).json({ success: false, message: "Fail to create draft" });
  }
};

// 3. XÓA BẢN NHÁP (Khi user xóa tay hoặc sau khi Auto-log thành công)
export const deleteDraft = async (req: any, res: Response) => {
  try {
    const draftId = req.params.id;
    await WorkDraft.findByIdAndDelete(draftId);

    res.json({ success: true, message: "Delete draft successfully" });
  } catch (error: any) {
    console.error("Fail to delete draft:", error.message);
    res.status(500).json({ success: false, message: "Fail to delete draft" });
  }
};

export const executeDraftMatch = async (req: any, res: Response) => {
  try {
    const { draftId, parentTaskId, projectId, activityId } = req.body;
    const account = req.redmineAccount; // Lấy từ redmineInterceptor

    if (!account || !account.redmineUrl || !account.redmineApiKey) {
      return res.status(403).json({ success: false, message: "Chưa liên kết tài khoản Redmine." });
    }

    // 1. Tìm bản nháp trong Database
    const draft = await WorkDraft.findById(draftId);
    if (!draft) {
      return res.status(404).json({ success: false, message: "Không tìm thấy bản nháp. Có thể đã bị xóa." });
    }

    // 2. GỌI API REDMINE: TẠO TASK CON
    const createIssuePayload = {
      issue: {
        project_id: projectId,
        subject: draft.subject,
        parent_issue_id: parentTaskId,
        assigned_to_id: 'me' // Tự động gán cho chính mình
      }
    };

    const createRes = await axios.post(
      `${account.redmineUrl}/issues.json`,
      createIssuePayload,
      { headers: { 'X-Redmine-API-Key': account.redmineApiKey, 'Content-Type': 'application/json' } }
    );

    const newTaskId = createRes.data.issue.id;
    console.log(`✅ [Auto-log] Đã tạo Task con thành công: #${newTaskId}`);

    // 3. GỌI API REDMINE: LOG TIME VÀO TASK VỪA TẠO
    const logTimePayload: any = {
      time_entry: {
        issue_id: newTaskId,
        hours: draft.hours,
        spent_on: draft.spentOn,
        activity_id: draft.activityId,
        comments: draft.comments || ""
      }
    };

    // (Tùy chọn) Truyền activity_id nếu Redmine của bạn bắt buộc phải có
    if (activityId) {
      logTimePayload.time_entry.activity_id = activityId;
    }

    await axios.post(
      `${account.redmineUrl}/time_entries.json`,
      logTimePayload,
      { headers: { 'X-Redmine-API-Key': account.redmineApiKey, 'Content-Type': 'application/json' } }
    );
    console.log(`✅ [Auto-log] Đã log ${draft.hours}h vào Task #${newTaskId}`);

    // 4. XÓA BẢN NHÁP (Dọn dẹp)
    await WorkDraft.findByIdAndDelete(draftId);

    res.json({
      success: true,
      message: "Hoàn tất! Đã tạo task và log time.",
      data: { newTaskId: newTaskId }
    });

  } catch (error: any) {
    console.error("Lỗi khi thực thi Automation:", error.response?.data || error.message);

    // Bắt lỗi cụ thể từ Redmine để báo cho UI
    const errorMsg = error.response?.data?.errors
      ? error.response.data.errors.join(', ')
      : "Lỗi hệ thống khi kết nối với Redmine.";

    res.status(500).json({ success: false, message: errorMsg });
  }
};
