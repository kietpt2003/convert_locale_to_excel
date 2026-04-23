import {
  renderCalendar,
  changeMonth,
  goToToday,
  initQuickSelectors,
} from "./calendar.js";
import { initModalEvents } from "./modalLogTime.js";

const token = localStorage.getItem("app_token");
let TRACKERS_CACHE = [];

// Use this function to navigate and remove token in admin-redmine
async function fetchWithAuth(url, options = {}) {
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
