import { fetchWithAuth } from "./redmine.js";

let activityMap = {};
let globalDrafts = [];
window.globalTrackerMap = window.globalTrackerMap || { 5: "Task" };

export async function initDraftWidget() {
  // Gán ngày mặc định là hôm nay (Sửa lỗi Timezone)
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  document.getElementById("draftDate").value = `${y}-${m}-${d}`;

  // Lắng nghe sự kiện Add
  document.getElementById("btnAddDraft").onclick = handleAddDraft;

  // Event search draft
  document.getElementById("draftSearchInput").addEventListener("input", (e) => {
    const keyword = e.target.value.trim().toLowerCase();

    if (!keyword) {
      renderDraftList(globalDrafts); // Xóa hết thì render lại full
      return;
    }

    // Thuật toán tìm kiếm
    const filteredDrafts = globalDrafts.filter((draft) => {
      const activityName =
        activityMap[draft.activityId] || `Act #${draft.activityId}`;
      const trackerName =
        window.globalTrackerMap[draft.trackerId] ||
        `Tracker #${draft.trackerId || 5}`;

      return (
        draft.subject.toLowerCase().includes(keyword) ||
        activityName.toLowerCase().includes(keyword) ||
        trackerName.toLowerCase().includes(keyword) ||
        draft.spentOn.includes(keyword)
      );
    });

    renderDraftList(filteredDrafts, keyword);
  });

  await loadQuickDraftTrackers();
  await loadActivities();
  await loadDrafts();
}

async function loadActivities() {
  try {
    const res = await fetchWithAuth("/api/redmine/activities");
    const data = await res.json();

    if (data.activities) {
      const select = document.getElementById("draftActivity");
      data.activities.forEach((act) => {
        select.add(new Option(act.name, act.id));
        activityMap[act.id] = act.name;
      });
    }
  } catch (error) {
    console.error("Fail to load Activity", error);
  }
}

export async function loadDrafts() {
  try {
    const res = await fetchWithAuth("/api/redmine/drafts");
    const result = await res.json();

    if (result.success) {
      globalDrafts = result.data;
      renderDraftList(result.data);
    }
  } catch (error) {
    console.error("Fail to load drafts", error);
  }
}

function highlightText(text, keyword) {
  if (!keyword) return text;

  const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${safeKeyword})`, "gi");

  return text.replace(
    regex,
    '<mark style="background-color: #fef08a; border-radius: 2px; padding: 0 2px;">$1</mark>',
  );
}

function renderDraftList(drafts, keyword = "") {
  const container = document.getElementById("draftListContainer");
  document.getElementById("draftCount").innerText = drafts.length;
  container.innerHTML = "";

  if (drafts.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: #94a3b8; font-size: 0.85rem; padding: 10px;">You haven't created any task drafts yet.</div>`;
    return;
  }

  drafts.forEach((draft) => {
    const div = document.createElement("div");
    div.className = "draft-item";
    div.draggable = true;

    const activityName =
      activityMap[draft.activityId] || `Act #${draft.activityId}`;

    // Đã fix lỗi undefined Tracker Name ở đây:
    const trackerName =
      window.globalTrackerMap[draft.trackerId] ||
      `Tracker #${draft.trackerId || 5}`;

    let displayDate = draft.spentOn;
    if (displayDate && displayDate.includes("-")) {
      const [year, month, day] = displayDate.split("-");
      displayDate = `${day}/${month}/${year}`;
    }

    // Áp dụng highlight
    const highlightedSubject = highlightText(draft.subject, keyword);
    const highlightedActivity = highlightText(activityName, keyword);
    const highlightedTracker = highlightText(trackerName, keyword);
    const highlightedDate = highlightText(displayDate, keyword);

    div.innerHTML = `
      <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; gap: 6px; padding-right: 8px;">
        <div class="draft-title" style="white-space: normal; word-break: break-word; line-height: 1.4;">
          ${highlightedSubject}
        </div>
        <div class="draft-meta" style="display: flex; flex-wrap: wrap; gap: 4px 8px;">
          <span style="white-space: nowrap;">⏱ ${draft.hours}h</span>
          <span style="white-space: nowrap;">🎯 ${highlightedTracker}</span>
          <span style="white-space: nowrap;">🏷 ${highlightedActivity}</span>
          <span style="white-space: nowrap;">📅 ${highlightedDate}</span>
        </div>
      </div>
      <button class="btn-del-draft" data-id="${draft._id}" style="flex-shrink: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">&times;</button>
    `;

    // Nút xóa
    div.querySelector(".btn-del-draft").onclick = () => deleteDraft(draft._id);

    // Kéo bắt đầu
    div.ondragstart = (e) => {
      e.dataTransfer.setData("application/json", JSON.stringify(draft));
      div.classList.add("dragging");
    };

    // Kéo kết thúc
    div.ondragend = () => div.classList.remove("dragging");

    container.appendChild(div);
  });
}

async function handleAddDraft() {
  const subject = document.getElementById("draftSubject").value;
  const hours = document.getElementById("draftHours").value;
  const spentOn = document.getElementById("draftDate").value;
  const activityId = document.getElementById("draftActivity").value;
  const trackerId = document.getElementById("draftTrackerSelect").value;

  if (!subject || !hours || !activityId) {
    alert(
      "Please enter the content, the number of hours, and select an Activity!",
    );
    return;
  }

  const btn = document.getElementById("btnAddDraft");
  btn.disabled = true;
  btn.innerText = "...";

  try {
    const res = await fetchWithAuth("/api/redmine/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, hours, spentOn, activityId, trackerId }),
    });

    if (res.ok) {
      document.getElementById("draftSubject").value = "";
      document.getElementById("draftHours").value = "";
      await loadDrafts();
    }
  } catch (error) {
    alert("Fail to create quick drafts.");
  } finally {
    btn.disabled = false;
    btn.innerText = "Add";
  }
}

async function deleteDraft(id) {
  try {
    await fetchWithAuth(`/api/redmine/drafts/${id}`, { method: "DELETE" });
    await loadDrafts();
  } catch (error) {
    console.error("Fail to delete drafts");
  }
}

async function loadQuickDraftTrackers() {
  try {
    const res = await fetchWithAuth("/api/redmine/scrape-filters");
    const result = await res.json();

    if (result.success && result.data && result.data.trackers) {
      const trackers = result.data.trackers;

      trackers.forEach((t) => {
        window.globalTrackerMap[t.id] = t.name;
      });

      populateSelect("draftTrackerSelect", trackers, "5");
    }
  } catch (error) {
    console.error("Lỗi khi tải danh sách Tracker cho Quick Drafts:", error);

    const select = document.getElementById("draftTrackerSelect");
    if (select && select.options.length === 1) {
      select.innerHTML = '<option value="5">Task (Default)</option>';
    }
  }
}

// Bổ sung hàm populateSelect vào nội bộ file này để tránh lỗi ReferenceError
function populateSelect(
  elementId,
  optionsArray,
  defaultVal = "",
  placeholder = null,
) {
  const select = document.getElementById(elementId);
  if (!select) return;

  select.innerHTML = "";
  if (placeholder) {
    select.add(new Option(placeholder, ""));
  }
  optionsArray.forEach((opt) => {
    // Đảm bảo so sánh kiểu string cho chuẩn xác
    const isSelected = String(opt.id) === String(defaultVal);
    select.add(new Option(opt.name, opt.id, isSelected, isSelected));
  });
}
