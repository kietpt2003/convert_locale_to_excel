import { loadModalProjects } from "./modalLogTime.js";

let currentViewDate = new Date();

export async function changeMonth(offset) {
  currentViewDate.setMonth(currentViewDate.getMonth() + offset);
  await renderCalendar();
}

export async function goToToday() {
  currentViewDate = new Date();
  await renderCalendar();
}

export async function renderCalendar() {
  const grid = document.getElementById("calendarGrid");
  const monthLabel = document.getElementById("currentMonthYear");

  if (!grid || !monthLabel) return;

  const monthName = currentViewDate.toLocaleString("en-US", { month: "long" });
  const month = currentViewDate.getMonth() + 1;
  const year = currentViewDate.getFullYear();

  monthLabel.innerText = `${monthName}, ${year}`;
  grid.innerHTML = '<div style="padding: 20px;">Loading data...</div>';

  try {
    const token = localStorage.getItem("app_token");
    const response = await fetch(
      `/api/redmine/monthly-status?month=${month}&year=${year}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const statusData = await response.json();

    let totalLogged = 0;
    Object.values(statusData).forEach((day) => {
      totalLogged += Number(day.hours || 0);
    });

    const maxHours = calculateMaxWorkingHours(year, month);
    const percentage = Math.min((totalLogged / maxHours) * 100, 100);

    // CẬP NHẬT UI STATS
    const progressText = document.getElementById("monthTotalProgress");
    const progressBar = document.getElementById("monthProgressBar");

    if (progressText && progressBar) {
      progressText.innerText = `${totalLogged} / ${maxHours}h`;
      progressBar.style.width = `${percentage}%`;

      // Đổi màu nếu hoàn thành tốt
      if (percentage >= 100) {
        progressBar.style.backgroundColor = "#27ae60";
      } else if (percentage > 50) {
        progressBar.style.backgroundColor = "#2ecc71";
      } else {
        progressBar.style.backgroundColor = "#f1c40f";
      }
    }

    // Logic tính toán ngày
    const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();

    // Điều chỉnh Thứ 2 là đầu tuần (Redmine/VN style)
    let startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

    grid.innerHTML = "";

    // 1. Render ô trống của tháng trước
    for (let i = 0; i < startOffset; i++) {
      grid.innerHTML += `<div class="day-cell empty" style="background: #f9f9f9;"></div>`;
    }

    // 2. Render ngày trong tháng
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayData = statusData[dateStr];
      const isFull = dayData && dayData.hours >= 8;
      const clickableClass = !isFull ? "clickable-slot" : "";

      let statusClass = "";
      let hoursHtml = "";

      if (dayData) {
        statusClass = dayData.isFull ? "status-full" : "status-incomplete";
        hoursHtml = `<span class="hours-badge">${dayData.hours}h</span>`;
      }

      grid.innerHTML += `
        <div class="day-cell ${statusClass} ${clickableClass}" 
            onclick="${!isFull ? `openLogModal('${dateStr}', ${dayData?.hours || 0})` : ""}">
          <span class="day-number">${day}</span>
          ${hoursHtml}
        </div>
      `;
    }

    syncSelectors();
  } catch (err) {
    console.error("Calendar Load Error:", err);
    grid.innerHTML = `<div class="empty-state">Unable to load calendar.</div>`;
  }
}

function calculateMaxWorkingHours(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  let workingDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay();
    // 0 là Chủ Nhật, 6 là Thứ 7. Chỉ tính Thứ 2 đến Thứ 6.
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays++;
    }
  }
  return workingDays * 8; // Mỗi ngày 8 tiếng
}

export function initQuickSelectors() {
  const sMonth = document.getElementById("selectMonth");
  const sYear = document.getElementById("selectYear");

  if (!sMonth || !sYear) return;

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  // Render danh sách tháng
  sMonth.innerHTML = months
    .map((m, i) => `<option value="${i}">${m}</option>`)
    .join("");

  // Render danh sách năm (từ 2024 đến 2030)
  const currentYear = new Date().getFullYear();
  let years = [];
  for (let y = currentYear - 2; y <= currentYear + 3; y++) {
    years.push(`<option value="${y}">${y}</option>`);
  }
  sYear.innerHTML = years.join("");

  syncSelectors();

  // Sự kiện khi thay đổi select
  const handleChange = () => {
    currentViewDate.setFullYear(parseInt(sYear.value));
    currentViewDate.setMonth(parseInt(sMonth.value));
    renderCalendar();
  };

  sMonth.onchange = handleChange;
  sYear.onchange = handleChange;

  // Trigger bấm vào label thì focus vào select tháng
  document.getElementById("datePickerTrigger").onclick = () => {
    sMonth.focus();
  };
}

// Cập nhật hàm sync để khi bấm Next/Prev thì các Select cũng nhảy theo
function syncSelectors() {
  const sMonth = document.getElementById("selectMonth");
  const sYear = document.getElementById("selectYear");
  if (sMonth && sYear) {
    sMonth.value = currentViewDate.getMonth();
    sYear.value = currentViewDate.getFullYear();
  }
}

window.openLogModal = async (date, currentHours) => {
  window.currentSelectedDate = date;

  const modal = document.getElementById("logTimeModal");
  document.getElementById("modalTitle").innerText = `Log Time: ${date}`;
  document.getElementById("modalHours").value = 8 - currentHours;

  const taskSelect = document.getElementById("modalTaskSelect");
  taskSelect.innerHTML = '<option value="">-- Select Task --</option>';
  taskSelect.disabled = true;

  modal.style.display = "block";
  loadModalProjects();
};
