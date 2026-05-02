import { fetchWithAuth } from "./redmine.js";

let activityMap = {};
let globalDrafts = [];

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

    // Thuật toán tìm kiếm (Không phân biệt hoa thường, chứa nửa chữ cũng lấy)
    const filteredDrafts = globalDrafts.filter((draft) => {
      const activityName =
        activityMap[draft.activityId] || `Act #${draft.activityId}`;

      // Tìm trong Subject hoặc Activity Name hoặc Date
      return (
        draft.subject.toLowerCase().includes(keyword) ||
        activityName.toLowerCase().includes(keyword) ||
        draft.spentOn.includes(keyword)
      );
    });

    renderDraftList(filteredDrafts, keyword);
  });

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
  if (!keyword) return text; // Không có chữ thì trả về nguyên gốc

  // Thoát (escape) các ký tự đặc biệt của Regex (vd: +, ?, *, [, ],...) để không bị văng lỗi khi gõ
  const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // /gi nghĩa là: g = global (tìm tất cả), i = case-insensitive (không phân biệt hoa thường)
  const regex = new RegExp(`(${safeKeyword})`, "gi");

  // Bọc phần text khớp bằng thẻ mark kèm chút CSS cho đẹp
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

    let displayDate = draft.spentOn;
    if (displayDate && displayDate.includes("-")) {
      const [year, month, day] = displayDate.split("-");
      displayDate = `${day}/${month}/${year}`;
    }

    // Áp dụng highlight cho Subject, Activity và Ngày
    const highlightedSubject = highlightText(draft.subject, keyword);
    const highlightedActivity = highlightText(activityName, keyword);
    const highlightedDate = highlightText(displayDate, keyword);

    div.innerHTML = `
      <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; gap: 4px; padding-right: 12px;">
        <div class="draft-title" style="white-space: normal; word-break: break-word; line-height: 1.4;">
          ${highlightedSubject}
        </div>
        <div class="draft-meta" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ⏱ ${draft.hours}h | 🏷 ${highlightedActivity} | 📅 ${highlightedDate}
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
      body: JSON.stringify({ subject, hours, spentOn, activityId }),
    });

    if (res.ok) {
      document.getElementById("draftSubject").value = ""; // Clear input
      document.getElementById("draftHours").value = "";
      await loadDrafts(); // Cập nhật lại UI
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
