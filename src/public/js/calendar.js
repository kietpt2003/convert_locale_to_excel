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

  const month = currentViewDate.getMonth() + 1;
  const year = currentViewDate.getFullYear();
  const monthName = currentViewDate.toLocaleString("en-US", { month: "long" });

  monthLabel.innerText = `${monthName}, ${year}`;
  grid.innerHTML = '<div style="padding: 20px;">Loading data...</div>';

  try {
    const token = localStorage.getItem("app_token");
    const response = await fetch(
      `/api/redmine/monthly-status?month=${month}&year=${year}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const statusData = await response.json();

    updateProgressStats(statusData, year, month);

    const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    let startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

    grid.innerHTML = ""; // Remove "Loading..."
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < startOffset; i++) {
      const emptyCell = document.createElement("div");
      emptyCell.className = "day-cell empty";
      fragment.appendChild(emptyCell);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayData = statusData[dateStr];
      const redminUrl = dayData?.redmineUrl || "";

      const dayCell = document.createElement("div");
      const clickableClass = !dayData?.isFull ? "clickable-slot" : "";
      dayCell.className = `day-cell ${dayData?.isFull ? "status-full" : "status-incomplete"} ${clickableClass}`;

      const htmlBuffer = [];
      htmlBuffer.push(
        `<div class="day-header"><span class="day-number">${day}</span>`,
      );

      if (dayData) {
        htmlBuffer.push(
          `<span class="hours-badge">${Number(dayData.totalHours).toFixed(1)}h</span>`,
        );
      }

      htmlBuffer.push(`</div><div class="log-list-container">`);

      if (dayData?.logs?.length > 0) {
        const redmineBaseUrl = `${dayData.redmineUrl}/issues`; // Dùng URL lấy từ Backend

        for (let i = 0; i < dayData.logs.length; i++) {
          const log = dayData.logs[i];
          const safeComment = log.comments ? log.comments : "No comment";

          // Tooltip giữ nguyên để hiển thị khi cần
          const tooltipText = `Project: ${log.project} | Task: #${log.issueId} - ${log.issueName}`;

          htmlBuffer.push(`
      <div class="log-item" data-comment="${tooltipText}">
        <div class="log-row-main">
            <span class="log-project">${log.project}</span>
            <span class="log-hours"><strong>${log.hours}h</strong></span>
        </div>
        <div class="log-row-sub">
            <a href="${redmineBaseUrl}/${log.issueId}" 
               target="_blank" 
               class="issue-link" 
               onclick="event.stopPropagation();">#${log.issueId}</a>
            <span class="log-comment">${safeComment}</span>
        </div>
      </div>`);
        }
      }

      htmlBuffer.push(
        `</div><button class="btn-quick-add" onclick="openLogModal('${dateStr}', ${dayData?.totalHours || 0})">+</button>`,
      );

      dayCell.innerHTML = htmlBuffer.join("");
      fragment.appendChild(dayCell);
    }

    grid.appendChild(fragment);
    syncSelectors();
  } catch (err) {
    console.error("Calendar Load Error:", err);
    grid.innerHTML = `<div class="empty-state">Unable to load calendar.</div>`;
  }
}

function updateProgressStats(statusData, year, month) {
  let totalLogged = 0;
  Object.values(statusData).forEach((day) => {
    totalLogged += Number(day.totalHours || 0);
  });

  const maxHours = calculateMaxWorkingHours(year, month);
  const percentage = Math.min((totalLogged / maxHours) * 100, 100);

  const progressText = document.getElementById("monthTotalProgress");
  const progressBar = document.getElementById("monthProgressBar");

  if (progressText && progressBar) {
    progressText.innerText = `${totalLogged.toFixed(1)} / ${maxHours}h`;
    progressBar.style.width = `${percentage}%`;
    progressBar.style.backgroundColor =
      percentage >= 100 ? "#27ae60" : percentage > 50 ? "#2ecc71" : "#f1c40f";
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
