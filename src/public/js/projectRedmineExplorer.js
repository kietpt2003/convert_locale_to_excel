import { fetchWithAuth, loadFullProjectTree } from "./redmine.js";
import { renderCalendar } from "./calendar.js";
/**
 * Mở modal Log Time nhanh từ cây thư mục
 * @param {Object} task - Đối tượng task chứa id và subject
 */
export async function openQuickLogTime(task) {
  const modal = document.getElementById("quickLogTimeModal");
  const taskInfo = document.getElementById("quickTaskInfo");
  const dateInput = document.getElementById("quickModalDate");
  const actSelect = document.getElementById("quickModalActivitySelect");

  // 1. Hiển thị thông tin task
  taskInfo.innerText = `[#${task.id}] ${task.subject}`;
  modal.dataset.taskId = task.id; // Lưu ID vào dataset để dùng khi submit

  // 2. Set ngày mặc định là hôm nay (theo định dạng YYYY-MM-DD)
  const today = new Date().toLocaleDateString("en-CA");
  dateInput.value = today;

  // 3. Load activities (Tái sử dụng logic cũ nhưng đổi target select)
  await loadQuickActivities();

  modal.style.display = "block";
}

// Hàm load activities riêng cho Quick Modal để tránh ảnh hưởng modal chính
async function loadQuickActivities() {
  const actSelect = document.getElementById("quickModalActivitySelect");
  const token = localStorage.getItem("app_token");

  // Tận dụng logic đã có hoặc copy nhanh từ loadActivities
  const res = await fetchWithAuth("/api/redmine/activities", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  actSelect.innerHTML = "";
  data.activities.forEach((act) => {
    const opt = new Option(act.name, act.id);
    if (act.is_default) opt.selected = true;
    actSelect.add(opt);
  });
}

// Khởi tạo sự kiện Submit cho Quick Modal
export function initQuickModalEvents() {
  const btnSubmit = document.getElementById("btnSubmitQuickLog");
  const modal = document.getElementById("quickLogTimeModal");

  btnSubmit.onclick = async () => {
    const taskId = modal.dataset.taskId;
    const hours = document.getElementById("quickModalHours").value;
    const date = document.getElementById("quickModalDate").value;
    const activityId = document.getElementById(
      "quickModalActivitySelect",
    ).value;
    const comments = document.getElementById("quickModalDescription").value;

    if (!hours || hours <= 0) {
      alert("Please enter valid hours!");
      return;
    }

    btnSubmit.innerText = "Logging...";
    btnSubmit.disabled = true;

    try {
      const token = localStorage.getItem("app_token");
      const res = await fetchWithAuth("/api/redmine/logtime", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          issue_id: taskId,
          hours: hours,
          spent_on: date,
          activity_id: activityId,
          comments: comments,
        }),
      });

      if (res.ok) {
        alert("✅ Logged successfully!");
        modal.style.display = "none";
        document.getElementById("quickModalDescription").value = "";
        loadFullProjectTree(true);
        renderCalendar(); // Refresh calendar để cập nhật giờ
      } else {
        const result = await res.json();
        alert(`⚠️ ${result.message}`);
      }
    } catch (err) {
      alert("Logtime failed.");
    } finally {
      btnSubmit.innerText = "Submit Log";
      btnSubmit.disabled = false;
    }
  };
}

// Hàm đóng modal
window.closeQuickModal = () => {
  document.getElementById("quickLogTimeModal").style.display = "none";
};
