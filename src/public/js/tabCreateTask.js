import { fetchWithAuth, buildProjectTree, highlightText } from "./redmine.js";

let tabOrderedTasks = [];
let allTabProjects = [];
let allTabTasks = [];
let currentCustomFieldConfigs = {};

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
  const res = await fetchWithAuth(`/api/redmine/projects`);
  const data = await res.json();

  const projectTree = buildProjectTree(data.projects);
  allTabProjects = flattenProjectTree(projectTree); // Hàm làm phẳng đã viết ở trên

  // Gọi render để hiển thị dữ liệu thô ban đầu
  renderProjectExplorer(allTabProjects);
}

async function fetchTasksForTab(projectId) {
  const tList = document.getElementById("tabParentTaskList");
  if (!projectId) return;

  tList.style.display = "block";
  renderSkeleton("tabParentTaskList", 6);

  try {
    const res = await fetchWithAuth(`/api/redmine/projects/${projectId}/tasks`);
    const data = await res.json();
    allTabTasks = processTaskHierarchy(data.tasks);
    tabOrderedTasks = allTabTasks; // Lưu lại để dùng sau
    renderTaskExplorer(allTabTasks);
  } catch (err) {
    tList.innerHTML =
      '<div class="explorer-item" style="color:red">⚠️ Error loading tasks</div>';
  }
}

async function loadProjectOptions(projectId) {
  // Disable form trong lúc load
  toggleForm(false);

  try {
    // Gọi API filter của bạn (Đổi đường dẫn nếu backend của bạn cấu hình khác nhé)
    const res = await fetchWithAuth(
      `/api/redmine/projects/${projectId}/task-options`,
    );
    const result = await res.json();

    if (result.success) {
      const data = result.data;

      // 1. Đổ dữ liệu các trường cơ bản
      populateSelect("tabTrackerSelect", data.trackers, "5"); // 5 For default Task
      populateSelect("tabStatusSelect", data.statuses);
      populateSelect("tabPrioritySelect", data.priorities, "2"); // 2 For default Normal
      populateSelect("tabDoneRatioSelect", data.doneRatios, "0"); // 0 For default 0%

      // 2. Đổ dữ liệu Assignee và AUTO SELECT "ME"
      const assigneeSelect = document.getElementById("tabAssigneeSelect");
      assigneeSelect.innerHTML = '<option value="">-- Unassigned --</option>';
      data.assignees.forEach((opt) => {
        const option = new Option(opt.name, opt.id);
        // Nếu API trả về "<< me >>" thì gán vào giá trị biến mặc định của hệ thống
        if (opt.name.includes("<< me >>")) {
          option.selected = true;
          option.value = "me"; // Redmine api nhận 'me'
        }
        assigneeSelect.add(option);
      });

      // 3. Đổ dữ liệu Custom Fields (Epic Type, WBS)
      currentCustomFieldConfigs = data.customFields || {};

      if (currentCustomFieldConfigs["Epic Type"]) {
        populateSelect(
          "tabEpicTypeSelect",
          currentCustomFieldConfigs["Epic Type"].options,
          "",
          "-- Select Epic Type --",
        );
      }

      if (currentCustomFieldConfigs["WBS"]) {
        populateSelect(
          "tabWbsSelect",
          currentCustomFieldConfigs["WBS"].options,
          "",
          "-- Select WBS --",
        );
      }

      // Load xong thì mở khóa form
      toggleForm(true);
    }
  } catch (error) {
    console.error("Lỗi lấy option tạo task", error);
    alert("Không thể tải cấu hình form của dự án này.");
  }
}

// Helper: Đổ dữ liệu vào thẻ Select
function populateSelect(
  elementId,
  optionsArray,
  defaultVal = "",
  placeholder = null,
) {
  const select = document.getElementById(elementId);
  select.innerHTML = "";
  if (placeholder) {
    select.add(new Option(placeholder, ""));
  }
  optionsArray.forEach((opt) => {
    const isSelected = opt.id === defaultVal;
    select.add(new Option(opt.name, opt.id, isSelected, isSelected));
  });
}

// Helper: Khóa/Mở khóa Form
function toggleForm(isEnabled) {
  const fields = [
    "tabTaskSearch",
    "tabTaskSubject",
    "tabTrackerSelect",
    "tabStatusSelect",
    "tabPrioritySelect",
    "tabAssigneeSelect",
    "tabDoneRatioSelect",
    "tabEpicTypeSelect",
    "tabWbsSelect",
    "btnConfirmTabCreate",
  ];
  fields.forEach((id) => {
    document.getElementById(id).disabled = !isEnabled;
  });
}

async function handleTabCreateTask() {
  const projectId = document.getElementById("tabProjectSelect").value;
  const parentId = document.getElementById("tabParentTaskSelect").value;
  const subject = document.getElementById("tabTaskSubject").value;

  if (!projectId || !subject) {
    alert("Please fill Project and Subject!");
    return;
  }

  const payload = {
    project_id: projectId,
    subject: subject,
    parent_issue_id: parentId || null,
    tracker_id: document.getElementById("tabTrackerSelect").value,
    status_id: document.getElementById("tabStatusSelect").value,
    priority_id: document.getElementById("tabPrioritySelect").value,
    assigned_to_id: document.getElementById("tabAssigneeSelect").value,
    done_ratio: document.getElementById("tabDoneRatioSelect").value,
    custom_fields: [], // Mảng chứa Epic, WBS...
  };

  const epicVal = document.getElementById("tabEpicTypeSelect").value;
  if (epicVal && currentCustomFieldConfigs["Epic Type"]) {
    payload.custom_fields.push({
      id: currentCustomFieldConfigs["Epic Type"].id,
      value: epicVal,
    });
  }

  const wbsVal = document.getElementById("tabWbsSelect").value;
  if (wbsVal && currentCustomFieldConfigs["WBS"]) {
    payload.custom_fields.push({
      id: currentCustomFieldConfigs["WBS"].id,
      value: wbsVal,
    });
  }

  try {
    const btn = document.getElementById("btnConfirmTabCreate");
    btn.innerText = "Creating...";
    btn.disabled = true;

    const res = await fetchWithAuth(`/api/redmine/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      alert("✅ Task Created!");
      document.getElementById("tabTaskSubject").value = "";
      fetchTasksForTab(projectId); // Refresh list
    }
  } catch (err) {
    alert("Create failed");
  } finally {
    const btn = document.getElementById("btnConfirmTabCreate");
    btn.innerText = "Create Task";
    btn.disabled = false;
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
  const redmineBaseUrl = document.getElementById("modalRedmineUrl").value; // Lấy URL base của bạn
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
  const redmineBaseUrl = document.getElementById("modalRedmineUrl").value;
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

  inputHidden.value = item.id;
  searchInput.value = item.id
    ? `[${item.id}] ${item.name || item.subject}`
    : "";
  listBox.style.display = "none";

  if (type === "project") {
    // 1. Tải danh sách Parent Task
    fetchTasksForTab(item.id);

    // 2. Tải cấu hình Form Tạo Task (Status, Priority, Assignee, Custom fields...)
    loadProjectOptions(item.id);

    // Reset task cũ
    document.getElementById("tabParentTaskSelect").value = "";
    document.getElementById("tabTaskSearch").value = "";
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
