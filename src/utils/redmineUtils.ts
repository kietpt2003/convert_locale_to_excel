import axios, { HttpStatusCode } from "axios";
import { REDMINE_LOG_TIME_ACTIVITY } from "../constants/redmine.js";

/**
 * Lấy tổng số giờ đã log cho một issue cụ thể trong một ngày
 * @param issueId ID của task/issue
 * @param date Định dạng YYYY-MM-DD
 * @param token API Key của Redmine
 */
export async function getTotalLoggedHours(
  redmineUrl: string,
  issueId: number,
  date: string,
  token: string
): Promise<number> {
  try {
    const url = `${redmineUrl}/time_entries.json?issue_id=${issueId}&user_id=me&from=${date}&to=${date}`;

    const response = await axios.get(url, {
      method: 'GET',
      headers: {
        "X-Redmine-API-Key": token,
        "Content-Type": "application/json"
      }
    });

    if (response.status !== HttpStatusCode.Ok) {
      console.error(`[DEBUG] API Error: ${response.status} - ${response.statusText}`);
      return 0;
    }

    const data: RedmineTimeEntryResponse = response.data;

    const totalHours = data.time_entries.reduce((sum: number, entry: RedmineTimeEntry) => {
      return sum + Number(entry.hours);
    }, 0);

    return totalHours;
  } catch (error) {
    console.error(`Error check logtime for Issue ${issueId}:`, error);
    return 0;
  }
}

export async function getTotalLoggedHoursInDay(
  redmineUrl: string,
  date: string,
  token: string
): Promise<number> {
  try {
    const url = `${redmineUrl}/time_entries.json?user_id=me&from=${date}&to=${date}&limit=100`;

    const response = await axios.get(url, {
      headers: {
        "X-Redmine-API-Key": token,
        "Content-Type": "application/json"
      }
    });

    const data: RedmineTimeEntryResponse = response.data;

    const totalHours = data.time_entries.reduce((sum, entry) => sum + Number(entry.hours), 0);
    return totalHours;
  } catch (error) {
    console.error("Error when get total hours in day:", error);
    return 0;
  }
}

export async function autoLogTime(
  redmineUrl: string,
  targetIssueId: number,
  activityId: number,
  date: string,
  token: string
) {
  // BƯỚC 1: Check xem đã đủ 8 tiếng chưa
  const currentTotal = await getTotalLoggedHoursInDay(redmineUrl, date, token);

  if (currentTotal >= 8) {
    console.log(`[SKIP] Đã log đủ ${currentTotal}h. Không cần log thêm.`);
    return { success: true, message: "Already logged enough time" };
  }

  // BƯỚC 2: Tính số giờ còn thiếu
  const hoursToLog = 8 - currentTotal;
  console.log(`[ACTION] Đang log thêm ${hoursToLog}h vào Issue #${targetIssueId}...`);

  // BƯỚC 3: Gọi API tạo Time Entry mới
  try {
    const logUrl = `${redmineUrl}/time_entries.json`;
    await axios.post(logUrl, {
      time_entry: {
        issue_id: targetIssueId,
        spent_on: date,
        hours: hoursToLog,
        activity_id: activityId || REDMINE_LOG_TIME_ACTIVITY.DEVELOPMENT.key,
        // comments: "Auto logged by tool"
      }
    }, {
      headers: { "X-Redmine-API-Key": token }
    });

    console.log("[SUCCESS] Log time thành công!");
    return { success: true, logged: hoursToLog };
  } catch (error) {
    console.error("[ERROR] Không thể log time tự động:", error);
    throw error;
  }
}

export const getISOYearAndWeek = (dateString: string): string => {
  const date = new Date(dateString);
  date.setHours(0, 0, 0, 0);

  // Đưa ngày về ngày Thứ Năm của tuần hiện tại (Thứ Năm quyết định năm của tuần ISO)
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);

  // Ngày 4 tháng 1 luôn nằm trong tuần 1 của năm
  const week1 = new Date(date.getFullYear(), 0, 4);

  // Tính số lượng tuần
  const weekNumber = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);

  const year = date.getFullYear();
  // Đảm bảo tuần luôn có 2 chữ số (VD: 09, 14)
  const weekStr = weekNumber.toString().padStart(2, '0');

  return `${year}-${weekStr}`; // Kết quả: "2026-14"
};
