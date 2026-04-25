import { fetchWithAuth, buildProjectTree, highlightText } from "./redmine.js";

let tabOrderedTasks = [];
let allTabProjects = [];
let allTabTasks = [];

export async function initCreateTaskTab() {
  const pSearchInput = document.getElementById("tabProjectSearch");
  const tSearchInput = document.getElementById("tabTaskSearch");
  const pList = document.getElementById("tabProjectList");
  const tList = document.getElementById("tabParentTaskList");

  // 1. Tải dữ liệu Project ban đầu
  await loadTabProjects(); // Hàm này sẽ gọi renderProjectExplorer(allTabProjects)
  await loadTabStatuses();

  // 2. Sự kiện Search cho Project
  pSearchInput.oninput = (e) => {
    pList.style.display = "block"; // Hiện list khi gõ
    const keyword = e.target.value.toLowerCase();
    renderProjectExplorer(allTabProjects, keyword);
  };

  // 3. Sự kiện Search cho Task
  tSearchInput.oninput = (e) => {
    tList.style.display = "block";
    const keyword = e.target.value.toLowerCase();
    renderTaskExplorer(allTabTasks, keyword);
  };

  // 4. Ẩn danh sách khi click ra ngoài (UX cải tiến)
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".explorer-style")) {
      pList.style.display = "none";
      tList.style.display = "none";
    }
  });

  // Hiện lại list khi focus vào ô input
  pSearchInput.onfocus = () => (pList.style.display = "block");
  tSearchInput.onfocus = () => (tList.style.display = "block");

  // 5. Nút Confirm Create
  document.getElementById("btnConfirmTabCreate").onclick = handleTabCreateTask;
}

async function loadTabProjects() {
  const token = localStorage.getItem("app_token");
  const res = await fetchWithAuth(`/api/redmine/projects`);
  const data = await res.json();

  const projectTree = buildProjectTree(data.projects);
  allTabProjects = flattenProjectTree(projectTree); // Hàm làm phẳng đã viết ở trên

  // Gọi render để hiển thị dữ liệu thô ban đầu
  renderProjectExplorer(allTabProjects);
}

async function fetchTasksForTab(projectId) {
  const tList = document.getElementById("tabParentTaskList");
  const tSearchInput = document.getElementById("tabTaskSearch");

  if (!projectId) return;

  // 1. Hiển thị Skeleton loading ngay lập tức
  tList.style.display = "block";
  renderSkeleton("tabParentTaskList", 6); // Tạo 6 dòng loading

  try {
    const res = await fetchWithAuth(`/api/redmine/projects/${projectId}/tasks`);
    const data = await res.json();

    allTabTasks = processTaskHierarchy(data.tasks);

    // 2. Render dữ liệu thật (Sẽ xóa sạch Skeleton cũ)
    renderTaskExplorer(allTabTasks);
  } catch (err) {
    tList.innerHTML =
      '<div class="explorer-item" style="color:red">⚠️ Error loading tasks</div>';
  }
}

async function handleTabCreateTask() {
  const projectId = document.getElementById("tabProjectSelect").value;
  const parentId = document.getElementById("tabParentTaskSelect").value;
  const subject = document.getElementById("tabTaskSubject").value;
  const statusId = document.getElementById("tabStatusSelect").value;
  const epicType = document.getElementById("tabEpicTypeSelect").value;

  if (!projectId || !subject) {
    alert("Please fill Project and Subject!");
    return;
  }

  // Tìm EPIC_TYPE_ID từ custom_fields của task cha hoặc mặc định
  let epicFieldId = 1;
  if (parentId) {
    const parent = tabOrderedTasks.find((t) => t.id == parentId);
    const field = parent?.custom_fields?.find((cf) => cf.name === "Epic Type");
    if (field) epicFieldId = field.id;
  }

  const payload = {
    project_id: projectId,
    subject: subject,
    parent_issue_id: parentId || null,
    status_id: statusId,
    assigned_to_id: "me",
    custom_fields: [{ id: epicFieldId, value: epicType }],
  };

  console.log("check payload", payload);

  try {
    // const res = await fetchWithAuth(`/api/redmine/tasks`, {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify(payload),
    // });
    // if (res.ok) {
    //   alert("✅ Task Created!");
    //   document.getElementById("tabTaskSubject").value = "";
    //   fetchTasksForTab(projectId); // Refresh list
    // }
  } catch (err) {
    alert("Create failed");
  }
}

// Hàm bổ trợ load Status (New)
async function loadTabStatuses() {
  const sSelect = document.getElementById("tabStatusSelect");
  const res = await fetchWithAuth("/api/redmine/statuses");
  const data = await res.json();
  const newStatus =
    data.statuses.find((s) => s.name.toLowerCase() === "new") ||
    data.statuses[0];
  if (newStatus) {
    sSelect.innerHTML = `<option value="${newStatus.id}">${newStatus.name}</option>`;
    sSelect.disabled = true;
  }
}

/**
 * Chuyển đổi danh sách task phẳng từ API thành mảng đã sắp xếp Cha -> Con
 * Dựa trên logic bạn đã dùng trong modalLogTime.js
 */
function processTaskHierarchy(tasks) {
  if (!tasks || tasks.length === 0) return [];

  let ordered = [];
  const parents = tasks.filter((t) => !t.parent);
  const children = tasks.filter((t) => t.parent);

  // 1. Duyệt qua các task cha
  parents.forEach((p) => {
    ordered.push(p);
    // Tìm các con trực tiếp của cha này
    const subTasks = children.filter((c) => c.parent.id === p.id);
    ordered.push(...subTasks);
  });

  // 2. Xử lý các task con có cha không nằm trong danh sách trả về (Virtual Parents)
  children.forEach((c) => {
    if (!ordered.find((ot) => ot.id === c.id)) {
      const alreadyAddedParent = ordered.find((ot) => ot.id === c.parent.id);

      if (!alreadyAddedParent) {
        ordered.push({
          id: c.parent.id,
          subject: c.parent.subject || `PARENT TASK #${c.parent.id}`,
          isVirtual: true,
        });
      }
      ordered.push(c);
    }
  });

  return ordered;
}

async function loadEpicTypeForTab(selectedTaskId) {
  const epicSelect = document.getElementById("tabEpicTypeSelect");
  epicSelect.innerHTML = '<option value="">-- Select Epic Type --</option>';

  if (!selectedTaskId) return;

  const taskData = tabOrderedTasks.find((t) => t.id == selectedTaskId);

  if (taskData && taskData.custom_fields) {
    const epicField = taskData.custom_fields.find(
      (cf) => cf.name === "Epic Type",
    );

    if (epicField && epicField.possible_values) {
      epicField.possible_values.forEach((val) => {
        const opt = document.createElement("option");
        opt.value = val.value || val;
        opt.innerText = val.label || val;
        epicSelect.appendChild(opt);
      });
    }
  }
}

/**
 * Hàm lọc dropdown linh hoạt
 * @param {string} selectId - ID của thẻ select
 * @param {Array} data - Mảng dữ liệu gốc
 * @param {string} keyword - Từ khóa search
 * @param {string} type - 'project' hoặc 'task'
 */
function filterDropdown(selectId, data, keyword, type) {
  const select = document.getElementById(selectId);
  select.innerHTML = "";

  // Nếu là task, luôn giữ option mặc định ở đầu
  if (type === "task") {
    const defaultOpt = new Option("-- No Parent (Main Task) --", "");
    select.add(defaultOpt);
  }

  const filtered = data.filter((item) => {
    const name = type === "project" ? item.name : item.subject;
    const id = item.id.toString();
    return name.toLowerCase().includes(keyword) || id.includes(keyword);
  });

  filtered.forEach((item) => {
    const idStr = `[${item.id}]`;
    const nameStr = type === "project" ? item.name : item.subject;
    const indent = type === "task" && item.parent ? "   ↳ " : "";

    const option = new Option(`${indent}${idStr} ${nameStr}`, item.id);
    select.add(option);
  });

  if (filtered.length === 1) {
    select.selectedIndex = type === "task" ? 1 : 0; // 1 vì task có option trống ở đầu
    select.dispatchEvent(new Event("change")); // Kích hoạt load task hoặc epic type
  }
}

/**
 * Biến đổi cây Project thành mảng phẳng để phục vụ tìm kiếm
 */
function flattenProjectTree(projects, level = 0) {
  let flat = [];
  projects.forEach((p) => {
    // Thêm project hiện tại vào mảng phẳng
    flat.push({
      id: p.id,
      name: p.name,
      level: level, // Lưu lại level để hiển thị thụt đầu dòng nếu cần
      identifier: p?.identifier || "",
    });

    // Nếu có con, đệ quy để làm phẳng tiếp
    if (p.children && p.children.length > 0) {
      flat = flat.concat(flattenProjectTree(p.children, level + 1));
    }
  });
  return flat;
}

// Hàm render danh sách Project kiểu Explorer
function renderProjectExplorer(data, keyword = "") {
  const listBox = document.getElementById("tabProjectList");
  const redmineBaseUrl = document.getElementById("redmineUrl").value; // Lấy URL base của bạn
  listBox.innerHTML = "";

  data.forEach((p) => {
    if (
      keyword &&
      !p.name.toLowerCase().includes(keyword) &&
      !p.id.toString().includes(keyword)
    )
      return;

    const div = document.createElement("div");
    div.className = "explorer-item";

    const indent = "\u00A0".repeat(p.level * 4);
    const highlightedId = highlightText(p.id.toString(), keyword);
    const highlightedName = highlightText(p.name, keyword);
    const icon = p.level === 0 ? "📂" : "📁";

    // Tạo link cho Project
    const projectLink = `${redmineBaseUrl}/projects/${p?.identifier || ""}`;

    div.innerHTML = `
        <span class="label" style="${p.level === 0 ? "font-weight:bold" : ""}">
            ${indent}${icon} 
            <a href="${projectLink}" target="_blank" class="id-badge project-link-anchor" 
               onclick="event.stopPropagation()">[#${highlightedId}]</a>
            ${highlightedName}
        </span>
    `;

    div.style.paddingLeft = "12px";
    div.onclick = () => selectItem("project", p);
    listBox.appendChild(div);
  });
}

// Hàm render danh sách Task kiểu Explorer
function renderTaskExplorer(data, keyword = "") {
  const listBox = document.getElementById("tabParentTaskList");
  const redmineBaseUrl = document.getElementById("redmineUrl").value;
  listBox.innerHTML = "";

  // Thêm option mặc định
  const defaultDiv = document.createElement("div");
  defaultDiv.className = "explorer-item";
  defaultDiv.innerHTML = `<span class="icon"></span> <span class="label">-- No Parent (Main Task) --</span>`;
  defaultDiv.onclick = () =>
    selectItem("task", { id: "", subject: "-- No Parent --" });
  listBox.appendChild(defaultDiv);

  data.forEach((t) => {
    if (
      keyword &&
      !t.subject.toLowerCase().includes(keyword) &&
      !t.id.toString().includes(keyword)
    )
      return;

    const div = document.createElement("div");
    div.className = "explorer-item";

    // Đồng bộ logic dùng indent thay vì paddingLeft để hover đẹp hơn
    const indent = t.parent ? "\u00A0\u00A0\u00A0\u00A0" : "";
    const highlightedId = highlightText(t.id.toString(), keyword);
    const highlightedSubject = highlightText(t.subject, keyword);
    const icon = t.parent ? "🔹" : "📦";

    // Tạo link cho Task
    const taskLink = `${redmineBaseUrl}/issues/${t.id}`;

    div.innerHTML = `
            <span class="label">
                ${indent}<span class="icon">${icon}</span>
                <a href="${taskLink}" target="_blank" class="id-badge task-link-anchor" 
                   onclick="event.stopPropagation()">#${highlightedId}</a>
                ${highlightedSubject}
            </span>
        `;

    div.style.paddingLeft = "12px";
    div.onclick = () => selectItem("task", t);
    listBox.appendChild(div);
  });
}

// Hàm xử lý khi người dùng chọn một item
function selectItem(type, item) {
  const inputHidden = document.getElementById(
    type === "project" ? "tabProjectSelect" : "tabParentTaskSelect",
  );
  const searchInput = document.getElementById(
    type === "project" ? "tabProjectSearch" : "tabTaskSearch",
  );
  const listBox = document.getElementById(
    type === "project" ? "tabProjectList" : "tabParentTaskList",
  );

  // Gán giá trị thực (ID) vào hidden input
  inputHidden.value = item.id;

  // Hiển thị nhãn (Label) lên ô search
  searchInput.value = item.id
    ? `[${item.id}] ${item.name || item.subject}`
    : "";

  // Ẩn danh sách sau khi chọn
  listBox.style.display = "none";

  // Trigger logic tiếp theo
  if (type === "project") {
    fetchTasksForTab(item.id);
    // Reset task cũ khi đổi project
    document.getElementById("tabParentTaskSelect").value = "";
    document.getElementById("tabTaskSearch").value = "";
  } else {
    loadEpicTypeForTab(item.id);
  }
}

function renderSkeleton(containerId, rows = 5) {
  const container = document.getElementById(containerId);
  container.innerHTML = ""; // Xóa nội dung cũ (hoặc "Loading...")

  for (let i = 0; i < rows; i++) {
    const div = document.createElement("div");
    div.className = "skeleton-row";

    // Tạo độ dài ngẫu nhiên cho phần text để nhìn tự nhiên hơn
    const randomWidth = Math.floor(Math.random() * (80 - 40 + 1)) + 40;

    div.innerHTML = `
            <div class="skeleton-box skeleton-icon"></div>
            <div class="skeleton-box skeleton-id"></div>
            <div class="skeleton-box skeleton-text" style="width: ${randomWidth}%"></div>
        `;
    container.appendChild(div);
  }
}
