import {
  renderCalendar,
  changeMonth,
  goToToday,
  initQuickSelectors,
} from "./calendar.js";
import { initModalEvents } from "./modalLogTime.js";
import { debounce } from "./debounce.js";
import {
  initQuickModalEvents,
  openQuickLogTime,
} from "./projectRedmineExplorer.js";

const token = localStorage.getItem("app_token");
let TRACKERS_CACHE = [];

// Use this function to navigate and remove token in admin-redmine
export async function fetchWithAuth(url, options = {}) {
  const currentToken = localStorage.getItem("app_token");
  const headers = {
    ...options.headers,
    Authorization: `Bearer ${currentToken}`,
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem("app_token");
    window.location.replace("/index.html");
  }

  return response;
}

/**
 * Initialize application events
 */
export async function initApp() {
  // Load initial data
  await loadUserData();

  // Bind event for Save button
  const btnSave = document.getElementById("btnSaveConfig");
  if (btnSave) {
    btnSave.addEventListener("click", saveRedmineConfig);
  }

  initQuickSelectors();
  initModalEvents();
  initQuickModalEvents();

  document.getElementById("prevMonth").onclick = () => changeMonth(-1);
  document.getElementById("nextMonth").onclick = () => changeMonth(1);
  document.getElementById("btnToday").onclick = () => goToToday();

  // 3. Vẽ lịch lần đầu
  await renderCalendar();
}

// 1. Load configuration from MongoDB
export async function loadUserData() {
  try {
    const res = await fetchWithAuth(`/api/redmine/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const user = await res.json();

    if (user) {
      document.getElementById("redmineUrl").value = user.redmineUrl || "";
      document.getElementById("redmineApiKey").value = user.redmineApiKey || "";
      document.getElementById("format").value =
        user.namingTemplate || "[PROJECT] | [PARENT] | Working";

      if (user.redmineApiKey && user.redmineUrl) {
        fetchRedmineProjects(user.watchedProjectIds || []);
      }

      const userDisplay = document.getElementById("user-display");
      if (userDisplay) {
        userDisplay.innerText = user.email;
      }
    }
  } catch (err) {
    console.error("Failed to load user data:", err);
  }
}

// 2. Save configuration to MongoDB
export async function saveRedmineConfig() {
  const redmineUrl = document.getElementById("redmineUrl").value;
  const redmineApiKey = document.getElementById("redmineApiKey").value;
  const namingTemplate = document.getElementById("format").value;

  // Collect all checked project IDs
  const checkedBoxes = document.querySelectorAll(
    '#projectList input[type="checkbox"]:checked',
  );
  const watchedProjectIds = Array.from(checkedBoxes).map((cb) => cb.value);

  try {
    const res = await fetchWithAuth(`/api/redmine/user/redmine-config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        redmineUrl,
        redmineApiKey,
        watchedProjectIds,
        namingTemplate,
      }),
    });

    if (res.ok) {
      alert("Configuration saved successfully!");
      // Refresh list to keep UI in sync
      fetchRedmineProjects(watchedProjectIds);
    }
  } catch (err) {
    alert("Server connection error!");
  }
}

// 3. Fetch projects (Now using the proxy endpoint to avoid CORS)
export async function fetchRedmineProjects(selectedIds = []) {
  const listEl = document.getElementById("projectList");
  listEl.innerHTML = "Loading projects...";

  try {
    const res = await fetchWithAuth(`/api/redmine/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    listEl.innerHTML = "";

    const projectTree = buildProjectTree(data.projects);

    renderProjectTree(listEl, projectTree, selectedIds);

    if (data.projects.length === 0) {
      listEl.innerHTML = "No projects found.";
    }
  } catch (err) {
    console.error(err);
    listEl.innerHTML =
      "<span style='color:red'>Failed to load projects.</span>";
  }
}

export function buildProjectTree(projects) {
  const projectMap = {};
  const tree = [];

  projects.forEach((p) => {
    projectMap[p.id] = { ...p, children: [] };
  });

  projects.forEach((p) => {
    const projectType = p.custom_fields?.find(
      (cf) => cf.name === "Project Type",
    )?.value;

    let parentProject = null;
    if (p.parent?.id) {
      parentProject = projectMap[p.parent.id];
    } else if (projectType) {
      parentProject = Object.values(projectMap).find(
        (parent) => parent.name === projectType,
      );
    }

    if (parentProject) {
      parentProject.children.push(projectMap[p.id]);
    } else {
      tree.push(projectMap[p.id]);
    }
  });

  return tree;
}

/**
 * Helper to render a project row
 */
function renderProjectTree(container, projects, selectedIds, level = 0) {
  projects.forEach((project) => {
    const div = document.createElement("div");
    const isChecked = selectedIds.includes(project.id.toString())
      ? "checked"
      : "";

    div.style.paddingLeft = `${level * 20}px`;
    div.className = `project-item ${level > 0 ? "child" : "parent"}`;

    const labelClass = level === 0 ? "parent-label" : "child-label";

    div.innerHTML = `
            <input type="checkbox" value="${project.id}" id="p-${project.id}" ${isChecked}>
            <span class="${labelClass}">
                [${project.id}] ${project.name}
            </span>
        `;

    container.appendChild(div);

    if (project.children && project.children.length > 0) {
      renderProjectTree(container, project.children, selectedIds, level + 1);
    }
  });
}

/**
 * Scan for parent tasks and populate the table
 */
export async function scanForTasks() {
  const queueBody = document.getElementById("pendingQueue");
  const template = document.getElementById("format").value;

  // Đảm bảo đã có danh sách tracker trước khi render
  if (TRACKERS_CACHE.length === 0) await fetchTrackers();

  queueBody.innerHTML =
    "<tr><td colspan='6' class='empty-table'>Scanning Redmine...</td></tr>";

  try {
    const res = await fetchWithAuth(`/api/redmine/scan-parents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    queueBody.innerHTML = "";

    if (!data.issues || data.issues.length === 0) {
      queueBody.innerHTML =
        "<tr><td colspan='6' class='empty-table'>No new parent tasks found.</td></tr>";
      return;
    }

    data.issues.forEach((issue) => {
      let suggestedName = template;

      // Render dropdown từ TRACKERS_CACHE
      const trackerOptions = TRACKERS_CACHE.map(
        (t) =>
          `<option value="${t.id}" ${t.id === 5 ? "selected" : ""}>${t.name}</option>`,
      ).join("");

      const tr = document.createElement("tr");
      tr.innerHTML = `
                <td><small>[${issue.project.id}] - ${issue.project.name}</small></td>
                <td><span class="author-badge">[${issue.author.id}] - ${issue.author.name}</span></td>
                <td><strong>#${issue.id}</strong>: ${issue.subject}</td>
                <td>
                    <select class="editable-input" style="padding: 5px; cursor: pointer;" id="tracker-${issue.id}">
                        ${trackerOptions}
                    </select>
                </td>
                <td>
                    <input type="text" class="editable-input" value="${suggestedName}" id="subject-${issue.id}">
                </td>
                <td>
                    <button class="btn-confirm" onclick="confirmCreateSubtask(${issue.id}, ${issue.project.id})">
                        Approve
                    </button>
                </td>
            `;
      queueBody.appendChild(tr);
    });
  } catch (err) {
    queueBody.innerHTML =
      "<tr><td colspan='6' class='empty-table' style='color:red'>Failed to fetch data.</td></tr>";
  }
}

async function fetchTrackers() {
  try {
    const res = await fetchWithAuth("/api/redmine/trackers", {
      headers: { Authorization: `Bearer ${token}` },
    });
    TRACKERS_CACHE = await res.json();
  } catch (err) {
    console.error("Failed to load trackers", err);
    // Fallback dự phòng nếu API lỗi
    TRACKERS_CACHE = [{ id: 5, name: "Task" }];
  }
}

/**
 * Send the final sub-task name to backend
 */
window.confirmCreateSubtask = async function (parentId, projectId) {
  const subject = document.getElementById(`subject-${parentId}`).value;

  try {
    const res = await fetchWithAuth(`/api/redmine/create-subtask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ parentId, projectId, subject }),
    });

    if (res.ok) {
      alert("Sub-task created successfully!");
      scanForTasks(); // Refresh list
    } else {
      alert("Failed to create sub-task");
    }
  } catch (err) {
    alert("Network error");
  }
};

// 1. Hàm chuyển đổi Tab
window.openTab = function (evt, tabName) {
  // 1. Lấy tất cả các tab content và loại bỏ class 'active'
  const tabContents = document.querySelectorAll(".tab-content");
  tabContents.forEach((content) => {
    content.classList.remove("active");
  });

  // 2. Lấy tất cả các nút tab và loại bỏ class 'active'
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach((btn) => {
    btn.classList.remove("active");
  });

  // 3. Thêm class 'active' vào tab hiện tại và nút vừa bấm
  const selectedTab = document.getElementById(tabName);
  if (selectedTab) {
    selectedTab.classList.add("active");
  }

  if (evt && evt.currentTarget) {
    evt.currentTarget.classList.add("active");
  }

  // 4. Nếu là tab Explorer thì load dữ liệu
  if (tabName === "explorer-tab") {
    loadFullProjectTree();
  }
};

// Hàm bổ trợ để highlight từ khóa
function highlightText(text, query) {
  if (!query || !query.trim()) return text;

  // Escape các ký tự đặc biệt trong regex và tạo pattern (không phân biệt hoa thường)
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escapedQuery})`, "gi");

  return text.replace(regex, '<mark class="highlight-text">$1</mark>');
}

function renderProjectNodes(projects, parentElement, pQuery, tQuery) {
  projects.forEach((proj) => {
    const li = document.createElement("li");
    const hasChildren =
      (proj.subProjects && proj.subProjects.length > 0) ||
      (proj.tasks && proj.tasks.length > 0);

    li.className = `tree-item project-node ${hasChildren ? "" : "no-children"}`;

    // Highlight ID và Name
    const highlightedProjectId = highlightText(proj.id.toString(), pQuery);
    const highlightedName = highlightText(proj.name, pQuery);

    // Lấy URL từ input hoặc config (giả sử có element id='redmineUrl')
    const redmineBaseUrl = document.getElementById("redmineUrl").value;
    const projectLink = `${redmineBaseUrl}/projects/${proj?.identifier || ""}`;

    li.innerHTML = `
      <div class="tree-row">
        <span class="toggle-icon">▶</span>
        <span class="icon">📁</span>
        <span class="label project-name">
          [<a href="${projectLink}" target="_blank" class="project-id-link" onclick="event.stopPropagation()">#${highlightedProjectId}</a>] 
          ${highlightedName}
        </span>
        <span class="badge">${proj.tasks ? proj.tasks.length : 0} tasks</span>
      </div>
      <ul class="sub-tree"></ul>
    `;

    const subTreeUl = li.querySelector(".sub-tree");
    const treeRow = li.querySelector(".tree-row");

    // Sự kiện đóng mở (Click vào tree-row nhưng trừ cái link ra nhờ stopPropagation ở trên)
    treeRow.addEventListener("click", (e) => {
      e.stopPropagation();
      li.classList.toggle("open");
    });

    if (proj.subProjects && proj.subProjects.length > 0) {
      renderProjectNodes(proj.subProjects, subTreeUl, pQuery, tQuery);
    }
    if (proj.tasks && proj.tasks.length > 0) {
      renderTaskNodes(proj.tasks, subTreeUl, tQuery);
    }

    parentElement.appendChild(li);
  });
}

function renderTaskNodes(tasks, parentElement, tQuery) {
  tasks.forEach((task) => {
    const li = document.createElement("li");
    const hasChildren = task.subtasks && task.subtasks.length > 0;

    li.className = `tree-item task-node ${hasChildren ? "" : "no-children"}`;
    const highlightedSubject = highlightText(task.subject, tQuery);
    const highlightedTaskId = highlightText(task.id.toString(), tQuery);

    // Lấy URL Redmine từ config để làm link (giả sử bạn lưu trong window.redmineUrl)
    const redmineUrl = document.getElementById("redmineUrl").value;
    const taskLink = `${redmineUrl}/issues/${task.id}`;

    li.innerHTML = `
      <div class="tree-row">
        <span class="toggle-icon">▶</span>
        <span class="icon">🔹</span>
        <a href="${taskLink}" target="_blank" class="task-id-link">#${highlightedTaskId}</a>
        <span class="spent-hours-badge">${task?.spent_hours || 0}h</span>
        <span class="label task-subject">${highlightedSubject}</span>
        <span class="task-status">${task.status.name}</span>
        <span class="log-time-trigger" title="Quick Log Time">🕒</span>
      </div>
      <ul class="sub-tree"></ul>
    `;

    const treeRow = li.querySelector(".tree-row");
    const logTimeBtn = li.querySelector(".log-time-trigger");

    // Click vào dòng để đóng/mở
    treeRow.addEventListener("click", (e) => {
      e.stopPropagation();
      li.classList.toggle("open");
    });

    // Sự kiện mở Modal Log Time nhanh
    logTimeBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // Ngăn việc đóng/mở tree khi click icon
      openQuickLogTime(task);
    });

    if (hasChildren) {
      renderTaskNodes(task.subtasks, li.querySelector(".sub-tree"), tQuery);
    }
    parentElement.appendChild(li);
  });
}

// Cập nhật hàm loadFullProjectTree để truyền query vào
async function loadFullProjectTree() {
  const pName = document.getElementById("treeSearchProject").value;
  const tName = document.getElementById("treeSearchTask").value;

  const container = document.getElementById("projectTreeContainer");
  // Không nên clear toàn bộ innerHTML liên tục khi gõ để tránh giật lag,
  // nhưng ở đây ta làm đơn giản để đảm bảo highlight mới nhất.
  container.style.opacity = "0.5";

  try {
    const response = await fetchWithAuth(
      `/api/redmine/projects/tasks?projectName=${pName}&taskName=${tName}`,
    );
    const data = await response.json();

    container.innerHTML = "";
    container.style.opacity = "1";

    if (!data || data.length === 0) {
      container.innerHTML = '<div class="empty-state">No data found</div>';
      return;
    }

    const rootList = document.createElement("ul");
    rootList.className = "tree-root";

    // Truyền thêm pName và tName xuống để highlight
    renderProjectNodes(data, rootList, pName, tName);

    if (pName || tName) {
      const allItems = rootList.querySelectorAll(".tree-item");
      allItems.forEach((item) => item.classList.add("open"));
    }

    container.appendChild(rootList);
  } catch (error) {
    container.innerHTML = '<div class="error-state">Error loading data</div>';
  }
}

const debouncedLoadTree = debounce(() => {
  loadFullProjectTree();
}, 1000);

// Lắng nghe sự kiện search
document
  .getElementById("treeSearchProject")
  .addEventListener("input", debouncedLoadTree);
document
  .getElementById("treeSearchTask")
  .addEventListener("input", debouncedLoadTree);
