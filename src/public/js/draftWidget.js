import { fetchWithAuth } from "./redmine.js";

let activityMap = {};

export async function initDraftWidget() {
  // Gán ngày mặc định là hôm nay (Sửa lỗi Timezone)
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  document.getElementById("draftDate").value = `${y}-${m}-${d}`;

  // Lắng nghe sự kiện Add
  document.getElementById("btnAddDraft").onclick = handleAddDraft;

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
      renderDraftList(result.data);
    }
  } catch (error) {
    console.error("Fail to load drafts", error);
  }
}

function renderDraftList(drafts) {
  const container = document.getElementById("draftListContainer");
  document.getElementById("draftCount").innerText = drafts.length;
  container.innerHTML = "";

  if (drafts.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: #94a3b8; font-size: 0.85rem; padding: 10px;">Chưa có bản nháp nào</div>`;
    return;
  }

  drafts.forEach((draft) => {
    const div = document.createElement("div");
    div.className = "draft-item";
    div.draggable = true; // Kích hoạt kéo thẻ

    // Lấy tên Activity từ Map, nếu không có (ví dụ bị xóa trên Redmine) thì hiện ID tạm
    const activityName =
      activityMap[draft.activityId] || `Act #${draft.activityId}`;

    div.innerHTML = `
      <div style="display: flex; flex-direction: column;">
        <span class="draft-title">${draft.subject}</span>
        <span class="draft-meta">⏱ ${draft.hours}h | 🏷 ${activityName} | 📅 ${draft.spentOn}</span>
      </div>
      <button class="btn-del-draft" data-id="${draft._id}">&times;</button>
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
