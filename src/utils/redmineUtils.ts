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

export const normalizeUrl = (url: string | null | undefined): string => {
  if (!url) return "";

  return url
    .trim()
    .replace(/^\/+|\/+$/g, ''); // Regex: Xóa tất cả '/' ở bắt đầu (^) hoặc kết thúc ($)
};

export const fetchRedmineDataParallel = async (url: string, apiKey: string, params: any, dataKey: string) => {
  const firstRes = await axios.get(url, {
    headers: { 'X-Redmine-API-Key': apiKey },
    params: { ...params, limit: 1, offset: 0 }
  });

  const totalCount = firstRes.data.total_count;
  if (!totalCount || totalCount === 0) return [];

  const limit = 100;
  const totalPages = Math.ceil(totalCount / limit);
  const fetchFunctions = [];

  // Tạo mảng CÁC HÀM (chưa thực thi promise vội)
  for (let i = 0; i < totalPages; i++) {
    const offset = i * limit;
    fetchFunctions.push(() => axios.get(url, {
      headers: { 'X-Redmine-API-Key': apiKey },
      params: { ...params, limit, offset }
    }).then(res => res.data[dataKey] || []));
  }

  // CHIA LÔ ĐỂ BẮN (Bắn 10 trang cùng lúc, xong mới bắn 10 trang tiếp theo)
  const batchSize = 10;
  const results = [];

  for (let i = 0; i < fetchFunctions.length; i += batchSize) {
    const batch = fetchFunctions.slice(i, i + batchSize);
    // Thực thi 10 hàm cùng lúc
    const batchResults = await Promise.all(batch.map(fn => fn()));
    results.push(...batchResults);
  }

  return results.flat();
};