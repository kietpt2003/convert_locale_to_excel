import {
  renderCalendar,
  changeMonth,
  goToToday,
  initQuickSelectors,
  initGlobalTooltip,
} from "./calendar.js";
import { debounce } from "./debounce.js";
import { initDraftWidget } from "./draftWidget.js";
import {
  initQuickModalEvents,
  openQuickLogTime,
} from "./projectRedmineExplorer.js";
import { initCreateTaskTab } from "./tabCreateTask.js";
import { initSpentTimeReportTab } from "./tabSpentTimeReport.js";
import { initUserGuide } from "./userGuide.js";

const token = localStorage.getItem("app_token");
let TRACKERS_CACHE = [];
let globalProjectTreeData = null;

// Use this function to navigate and remove token in admin-redmine
export async function fetchWithAuth(url, options = {}) {
  const currentToken = localStorage.getItem("app_token");
  const headers = {
    ...options.headers,
    Authorization: `Bearer ${currentToken}`,
  };

  const response = await fetch(url, { ...options, headers });

  const clonedRes = response.clone();

  if (
    response.status === 400 ||
    response.status === 401 ||
    response.status === 403
  ) {
    try {
      const data = await clonedRes.json();

      // Kiểm tra xem đây là lỗi của Hệ thống JWT App hay lỗi của Redmine Account
      const isRedmineError =
        data.message &&
        (data.message.includes("Redmine") ||
          data.message.includes("liên kết") ||
          data.message.includes("mật khẩu") ||
          data.message.includes("cấu hình"));

      if (isRedmineError) {
        // Bật Modal ép buộc login Redmine
        showRedmineLoginModal(data.message);
        throw new Error("REDMINE_AUTH_REQUIRED"); // Cắt đứt luồng chạy hiện tại
      } else {
        // Lỗi JWT token hệ thống hết hạn -> Văng ra màn hình đăng nhập chính
        localStorage.removeItem("app_token");
        // window.location.replace("/index.html");
      }
    } catch (e) {
      if (e.message !== "REDMINE_AUTH_REQUIRED") {
        localStorage.removeItem("app_token");
        window.location.replace("/index.html");
      } else {
        throw e; // Ném lỗi ra để các hàm bên ngoài dừng chạy (tránh báo lỗi tè le trên UI)
      }
    }
  }

  return response;
}

/**
 * Initialize application events
 */
export async function initApp() {
  // Load initial data
  await loadUserData();

  // Event Submit form
  document
    .getElementById("btnSubmitRedmineLogin")
    .addEventListener("click", handleRedmineLogin);

  // Open update login redmine fỏm event
  document
    .getElementById("btnUpdateRedmineCreds")
    .addEventListener("click", () =>
      showRedmineLoginModal("Update your Redmine login information.", true),
    );

  //Event press close modal login redmine
  document.getElementById("closeRedmineModal").addEventListener("click", () => {
    document.getElementById("redmineLoginOverlay").style.display = "none";
  });

  //Event reload project explorer
  document
    .getElementById("btnReloadTree")
    .addEventListener("click", async (e) => {
      globalProjectTreeData = null;

      // 3. Hiển thị trạng thái loading
      const container = document.getElementById("projectTreeContainer");
      container.innerHTML =
        '<div class="loading-state" style="padding: 20px; text-align: center; color: #64748b;">Fetch new data from Redmine...</div>';

      // 4. Gọi lại hàm load gốc (Vì globalProjectTreeData đã null, nó sẽ tự động fetch API lại từ đầu)
      await loadFullProjectTree(true);
    });

  // Event SHOW/HIDE PASSWORD
  const togglePasswordBtn = document.getElementById("togglePasswordBtn");
  const passwordInput = document.getElementById("modalRedminePassword");
  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener("click", () => {
      const isPassword = passwordInput.getAttribute("type") === "password";

      passwordInput.setAttribute("type", isPassword ? "text" : "password");

      // Change Icon
      if (isPassword) {
        // Icon Eye-off
        togglePasswordBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path>
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path>
            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path>
            <line x1="2" y1="2" x2="22" y2="22"></line>
          </svg>`;
      } else {
        // Icon Eye
        togglePasswordBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>`;
      }
    });
  }

  // Bind event for Save button
  const btnSave = document.getElementById("btnSaveConfig");
  if (btnSave) {
    btnSave.addEventListener("click", saveRedmineConfig);
  }

  initGlobalTooltip();
  initQuickSelectors();
  initQuickModalEvents();
  initDraftWidget();
  initUserGuide();

  document.getElementById("prevMonth").onclick = () => changeMonth(-1);
  document.getElementById("nextMonth").onclick = () => changeMonth(1);
  document.getElementById("btnToday").onclick = () => goToToday();

  try {
    await renderCalendar();
  } catch (e) {
    // Bỏ qua, Modal login đã bật rồi
  }
}

// 1. Load configuration from MongoDB
export async function loadUserData() {
  try {
    const res = await fetchWithAuth(`/api/redmine/user/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const user = await res.json();

    if (user) {
      window.currentRedmineUrl = user?.redmineProfile?.redmineUrl || "";

      document.getElementById("modalRedmineUrl").value =
        user?.redmineProfile?.redmineUrl || "";
      // document.getElementById("format").value =
      //   user?.redmineProfile?.namingTemplate ||
      //   "[PROJECT] | [PARENT] | Working";

      document.getElementById("modalRedmineUsername").value =
        user?.redmineProfile?.login || "Anonymous user";
      document.getElementById("modalRedminePassword").value =
        user?.redmineProfile?.password || "";

      const userDisplay = document.getElementById("user-display");
      if (userDisplay)
        userDisplay.innerText = user?.redmineProfile?.login || "";

      if (!user?.redmineProfile?.redmineUrl) {
        showRedmineLoginModal(
          "Welcome! You need to log in to Redmine to start using the tool.",
        );
        return;
      }

      // Cố gắng gọi API lấy project. Nếu session chết hoặc chưa cấu hình,
      // fetchWithAuth sẽ tự động quăng lỗi và bật Modal!
      // await fetchRedmineProjects(user?.redmineProfile?.watchedProjectIds || []);
    }
  } catch (err) {
    console.error("Failed to load user data:", err);
  }
}

// 2. Save configuration to MongoDB
export async function saveRedmineConfig() {
  const namingTemplate = document.getElementById("format").value;
  const checkedBoxes = document.querySelectorAll(
    '#projectList input[type="checkbox"]:checked',
  );
  const watchedProjectIds = Array.from(checkedBoxes).map((cb) => cb.value);

  try {
    const res = await fetchWithAuth(`/api/redmine/user/redmine-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watchedProjectIds, namingTemplate }),
    });

    if (res.ok) {
      alert("Preferences saved successfully!");
      fetchRedmineProjects(watchedProjectIds);
    }
  } catch (err) {}
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

  switch (tabName) {
    case "calendar-tab":
      renderCalendar();
      break;
    case "explorer-tab":
      loadFullProjectTree();
      break;

    case "tabCreateTask":
      initCreateTaskTab();
      break;

    case "tabSpentTimeReport":
      initSpentTimeReportTab();
      break;
    default:
      break;
  }
};

// Hàm bổ trợ để highlight từ khóa
export function highlightText(text, query) {
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

    // Lấy URL từ input hoặc config (giả sử có element id='modalRedmineUrl')
    const redmineBaseUrl = document.getElementById("modalRedmineUrl").value;
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

    const taskLink = `${window.currentRedmineUrl}/issues/${task.id}`;

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

    treeRow.ondragover = (e) => {
      e.preventDefault(); // BẮT BUỘC: Cho phép thẻ div nhận phần tử thả vào
      treeRow.classList.add("drag-over"); // Thêm class để CSS đổi màu nền sáng lên
    };

    // 2. Khi kéo lướt ra khỏi Task này (không thả)
    treeRow.ondragleave = () => {
      treeRow.classList.remove("drag-over"); // Tắt màu nền
    };

    // 3. Khi chính thức THẢ CHUỘT vào Task này
    treeRow.ondrop = async (e) => {
      e.preventDefault();
      treeRow.classList.remove("drag-over");

      const dragDataString = e.dataTransfer.getData("application/json");
      if (!dragDataString) return;

      const draftData = JSON.parse(dragDataString);
      const parentTaskId = task.id;
      const projectId = task.project ? task.project.id : null;

      if (
        confirm(
          `🤖 Automation: \n\nCreate sub-task "${draftData.subject}" for Task #${parentTaskId}. Then log ${draftData.hours}h on ${draftData.spentOn}\n\nProcess now?`,
        )
      ) {
        try {
          showLoadingOverlay(
            "The system is automatically creating tasks and logging time...",
          );

          const res = await fetchWithAuth("/api/redmine/drafts/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              draftId: draftData._id,
              parentTaskId: parentTaskId,
              projectId: projectId,
              activityId: draftData.activityId,
            }),
          });

          const result = await res.json();

          if (result.success) {
            alert(
              `🎉 ${result.message}\nTask #${result.data.newTaskId} created.`,
            );

            const draftEl = document.querySelector(
              `.draft-item .btn-del-draft[data-id="${draftData._id}"]`,
            );
            if (draftEl) draftEl.closest(".draft-item").remove();

            const container = document.getElementById("projectTreeContainer");
            container.innerHTML =
              '<div class="loading-state" style="padding: 20px; text-align: center; color: #64748b;">Retrieving the latest data from Redmine...</div>';

            loadFullProjectTree(true); // Done need to wait for this process to finish
          } else {
            alert(`❌ Error: ${result.message}`);
          }
        } catch (error) {
          alert("Network error or server not responding.");
        } finally {
          hideLoadingOverlay();
        }
      }
    };

    if (hasChildren) {
      renderTaskNodes(task.subtasks, li.querySelector(".sub-tree"), tQuery);
    }
    parentElement.appendChild(li);
  });
}

export async function loadFullProjectTree(forceReload = false) {
  const container = document.getElementById("projectTreeContainer");
  const isOnlyMine = document.getElementById("chkOnlyMyTasks").checked;

  if (forceReload) {
    globalProjectTreeData = null;
  }

  // 1. CHỈ GỌI API NẾU CHƯA CÓ DỮ LIỆU GỐC
  if (!globalProjectTreeData) {
    container.style.opacity = "0.5";
    const iconSvg = document.getElementById("iconReloadTree");

    try {
      if (iconSvg) iconSvg.style.animation = "spin 1s linear infinite";

      let waitTimeout;

      waitTimeout = setTimeout(() => {
        container.innerHTML =
          '<div class="loading-state" style="padding: 20px; text-align: center; color: #64748b;">Your company has lots of tasks, please wait until we can get all for you...</div>';
      }, 15000);

      const response = await fetchWithAuth(
        `/api/redmine/projects/tasks?reload=${forceReload}&onlyShowMyTasks=${isOnlyMine}`,
      );

      clearTimeout(waitTimeout);

      globalProjectTreeData = await response.json();

      const now = new Date();
      const timeString = now.toLocaleString("vi-VN", {
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      document.getElementById("lastUpdatedTime").innerText = timeString;
    } catch (error) {
      container.innerHTML = '<div class="error-state">Error loading data</div>';
    } finally {
      if (iconSvg) iconSvg.style.animation = "none";
      container.style.opacity = "1"; // Trả lại độ sáng
    }
  }

  // 2. CHẠY HÀM LỌC LOCAL
  executeLocalSearch();
}

function executeLocalSearch() {
  if (!globalProjectTreeData) return;

  const pName = document
    .getElementById("treeSearchProject")
    .value.toLowerCase();
  const tName = document.getElementById("treeSearchTask").value.toLowerCase();
  const container = document.getElementById("projectTreeContainer");

  container.style.opacity = "0.5";

  // --- THUẬT TOÁN ĐỆ QUY LỌC TASK ---
  function filterTasks(tasks) {
    if (!tName) return tasks; // Không search task thì giữ nguyên
    return tasks.reduce((acc, task) => {
      const matchSelf =
        task.subject.toLowerCase().includes(tName) ||
        task.id.toString().includes(tName);
      const filteredSubtasks = filterTasks(task.subtasks || []); // Đệ quy task con

      // Giữ task nếu nó khớp, HOẶC có task con khớp
      if (matchSelf || filteredSubtasks.length > 0) {
        acc.push({ ...task, subtasks: filteredSubtasks });
      }
      return acc;
    }, []);
  }

  // --- THUẬT TOÁN ĐỆ QUY LỌC PROJECT ---
  function filterProjects(projects) {
    return projects.reduce((acc, p) => {
      const filteredTasks = filterTasks(p.tasks || []);
      const filteredSubProjects = filterProjects(p.subProjects || []);

      const matchPName =
        !pName ||
        p.name.toLowerCase().includes(pName) ||
        p.id.toString().includes(pName);
      const hasTasks = filteredTasks.length > 0;
      const hasSubProjects = filteredSubProjects.length > 0;

      let keep = false;
      if (pName && tName) {
        // Search cả 2: Phải khớp Project VÀ có Task bên trong (hoặc có Project con khớp)
        keep = hasSubProjects || (matchPName && hasTasks);
      } else if (pName) {
        // Chỉ search Project
        keep = matchPName || hasSubProjects;
      } else if (tName) {
        // Chỉ search Task
        keep = hasTasks || hasSubProjects;
      } else {
        // Không search gì
        keep = true;
      }

      if (keep) {
        acc.push({
          ...p,
          tasks: filteredTasks,
          subProjects: filteredSubProjects,
        });
      }
      return acc;
    }, []);
  }

  // 3. APPLY LỌC VÀO DỮ LIỆU GỐC
  const filteredData = filterProjects(globalProjectTreeData);

  // 4. RENDER LẠI GIAO DIỆN
  container.innerHTML = "";
  container.style.opacity = "1";

  if (filteredData.length === 0) {
    container.innerHTML =
      '<div class="empty-state" style="padding:15px;text-align:center;color:#64748b;">No matching data found</div>';
    return;
  }

  const rootList = document.createElement("ul");
  rootList.className = "tree-root";

  renderProjectNodes(filteredData, rootList, pName, tName);

  // Mở rộng cây nếu có search
  if (pName || tName) {
    const allItems = rootList.querySelectorAll(".tree-item");
    allItems.forEach((item) => item.classList.add("open"));
  }

  container.appendChild(rootList);
}

const debouncedLoadTree = debounce(() => {
  executeLocalSearch();
}, 1000);

// ==========================================
// 2. REDMINE LOGIN MODAL LOGIC
// ==========================================
function showRedmineLoginModal(
  message = "Please login to your Redmine.",
  isUpdateMode = false,
) {
  const modal = document.getElementById("redmineLoginOverlay");
  const msgEl = document.getElementById("redmineLoginMessage");
  const errEl = document.getElementById("redmineLoginError");
  const closeBtn = document.getElementById("closeRedmineModal");

  msgEl.innerText = message;
  errEl.style.display = "none";
  modal.style.display = "block";

  if (isUpdateMode) {
    closeBtn.style.display = "block";
  } else {
    closeBtn.style.display = "none";
  }
}

async function handleRedmineLogin() {
  const urlParams = document.getElementById("modalRedmineUrl").value;
  const usernameParams = document.getElementById("modalRedmineUsername").value;
  const passwordParams = document.getElementById("modalRedminePassword").value;

  const errEl = document.getElementById("redmineLoginError");
  const btnSubmit = document.getElementById("btnSubmitRedmineLogin");

  if (!urlParams || !usernameParams || !passwordParams) {
    errEl.innerText =
      "Please enter the full Redmine URL, Username, and Password.";
    errEl.style.display = "block";
    return;
  }

  // Bật hiệu ứng loading
  btnSubmit.classList.add("loading");
  errEl.style.display = "none";

  try {
    const res = await fetchWithAuth(`/api/redmine/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        redmineUrl: urlParams,
        username: usernameParams,
        password: passwordParams,
      }),
    });

    const data = await res.json();

    if (res.ok) {
      // Thành công! Đóng modal và Refresh lại toàn bộ dữ liệu trên trang
      document.getElementById("redmineLoginOverlay").style.display = "none";
      alert("Login to your Redmine success!");

      // Reload lại app để cập nhật data bằng Session Cookie mới
      window.location.reload();
    } else {
      errEl.innerText =
        data.message || "Incorrect password or incorrect configuration.";
      errEl.style.display = "block";
    }
  } catch (err) {
    if (err.message !== "REDMINE_AUTH_REQUIRED") {
      errEl.innerText = "Server connection error!";
      errEl.style.display = "block";
    }
  } finally {
    btnSubmit.classList.remove("loading");
  }
}

// Lắng nghe sự kiện search
document
  .getElementById("treeSearchProject")
  .addEventListener("input", debouncedLoadTree);
document
  .getElementById("treeSearchTask")
  .addEventListener("input", debouncedLoadTree);
document
  .getElementById("chkOnlyMyTasks")
  .addEventListener("change", async function () {
    const container = document.getElementById("projectTreeContainer");
    const lastUpdatedTimeEl = document.getElementById("lastUpdatedTime");

    // Hiển thị trạng thái đang xử lý trên UI
    container.style.opacity = "0.5";

    container.innerHTML =
      '<div class="loading-state" style="padding: 20px; text-align: center; color: #64748b;">Fetch new data from Redmine...</div>';

    await loadFullProjectTree(true);

    container.style.opacity = "1";
  });

export function showLoadingOverlay(
  message = "It's being processed, please wait...",
) {
  let overlay = document.getElementById("global-loading-overlay");

  // Nếu DOM chưa có khối này thì tự động tạo ra và gắn vào Body
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "global-loading-overlay";
    overlay.innerHTML = `
      <div class="loading-spinner"></div>
      <div id="global-loading-text"></div>
    `;
    document.body.appendChild(overlay);
  }

  // Cập nhật câu thông báo và bật hiển thị bằng Flex
  document.getElementById("global-loading-text").innerText = message;
  overlay.style.display = "flex";
}

export function hideLoadingOverlay() {
  const overlay = document.getElementById("global-loading-overlay");
  if (overlay) {
    overlay.style.display = "none";
  }
}
