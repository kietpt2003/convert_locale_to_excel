import { renderCalendar } from "./calendar.js";
import { buildProjectTree } from "./redmine.js";

let orderedTasks = [];
let currentParentId = null;
let EPIC_TYPE_ID = 1;

/**
 * Lấy danh sách tasks của user trong một project cụ thể
 * @param {string|number} projectId - ID của project được chọn
 */
export async function fetchTasksByProject(projectId) {
  const taskSelect = document.getElementById("modalTaskSelect");
  const token = localStorage.getItem("app_token");

  if (!projectId) {
    taskSelect.innerHTML = '<option value="">-- Select Task --</option>';
    return;
  }

  orderedTasks = [];

  taskSelect.innerHTML = '<option value="">Loading tasks...</option>';
  taskSelect.disabled = true;

  try {
    const res = await fetch(`/api/redmine/projects/${projectId}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    taskSelect.innerHTML = '<option value="">-- Select Task --</option>';

    if (data.tasks && data.tasks.length > 0) {
      orderedTasks = [];

      const parentIdsInTasks = [
        ...new Set(data.tasks.filter((t) => t.parent).map((t) => t.parent.id)),
      ];

      const parents = data.tasks.filter((t) => !t.parent);
      const children = data.tasks.filter((t) => t.parent);

      parents.forEach((p) => {
        orderedTasks.push(p);
        const subTasks = children.filter((c) => c.parent.id === p.id);
        orderedTasks.push(...subTasks);
      });

      children.forEach((c) => {
        if (!orderedTasks.find((ot) => ot.id === c.id)) {
          const alreadyAddedParent = orderedTasks.find(
            (ot) => ot.id === c.parent.id,
          );
          if (!alreadyAddedParent) {
            orderedTasks.push({
              id: c.parent.id,
              subject: c.parent.subject || `PARENT TASK #${c.parent.id}`,
              totalSpentHours: "?",
              isVirtual: true,
            });
          }
          orderedTasks.push(c);
        }
      });

      orderedTasks.forEach((task) => {
        const option = document.createElement("option");
        option.value = task.id;

        let displayDate = "N/A";
        if (task.startDate && task.startDate !== "No date") {
          const [y, m, d] = task.startDate.split("-");
          displayDate = `${d}/${m}/${y}`;
        }

        const idCol = `#${task.id}`.padEnd(7, " ");
        const hoursCol = `${task.totalSpentHours}h`.padStart(6, " ");
        const dateCol = `${displayDate}`.padStart(6, " ");

        if (!task.parent) {
          option.innerText = `📂 ${idCol} ┃ ${task.subject.toUpperCase()}`;
          option.style.backgroundColor = "#f1f5f9";
          option.style.color = "#000000";
          option.style.fontWeight = "bold";
        } else {
          const treeBranch = " \u00A0\u00A0\u00A0";
          option.innerText = `${treeBranch} ${idCol} | ${dateCol} ┃ ${hoursCol} ┃ ${task.subject}`;
          option.style.color = "#4a5568";
        }

        taskSelect.appendChild(option);
      });
      taskSelect.disabled = false;
    } else {
      taskSelect.innerHTML =
        '<option value="">No tasks assigned to you</option>';
      taskSelect.disabled = true;
    }
  } catch (err) {
    console.error("Fetch tasks error:", err);
    taskSelect.innerHTML = '<option value="">Error loading tasks</option>';
  }
}

// Init logic modal log time
export function initModalEvents() {
  const pSelect = document.getElementById("modalProjectSelect");
  const btnSubmit = document.getElementById("btnSubmitLog");
  const btnClose = document.querySelector(".close-modal");
  const modal = document.getElementById("logTimeModal");
  const modalDescription = document.getElementById("modalDescription");

  // Listening on change project event
  pSelect.onchange = (e) => {
    const projectId = e.target.value;
    fetchTasksByProject(projectId);
  };

  btnSubmit.onclick = async () => {
    const taskId = document.getElementById("modalTaskSelect").value;
    const hours = document.getElementById("modalHours").value;
    const activityId = document.getElementById("modalActivitySelect").value;
    const comments = document.getElementById("modalDescription").value;
    const projectId = pSelect.value;

    const logDate = window.currentSelectedDate;

    if (!projectId || !taskId || !hours || hours <= 0 || !activityId) {
      alert("Please fill in all fields correctly!");
      return;
    }

    btnSubmit.innerText = "Logging...";
    btnSubmit.disabled = true;

    try {
      const token = localStorage.getItem("app_token");
      const res = await fetch("/api/redmine/logtime", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          issue_id: taskId,
          hours: hours,
          spent_on: logDate,
          activity_id: activityId,
          comments: comments,
        }),
      });

      const result = await res.json();

      if (res.ok) {
        alert("✅ Logged successfully!");
        modal.style.display = "none";
        modalDescription.value = "";

        await renderCalendar();
      } else {
        alert(`⚠️ ${result.message}`);
      }
    } catch (err) {
      alert("Logtime failed. Please try again later.");
    } finally {
      btnSubmit.innerText = "Submit Log";
      btnSubmit.disabled = false;
    }
  };

  btnClose.onclick = () => {
    modal.style.display = "none";
  };
}

//Load and render list projects
export async function loadModalProjects() {
  const pSelect = document.getElementById("modalProjectSelect");
  const token = localStorage.getItem("app_token");

  try {
    await loadActivities();
    const res = await fetch(`/api/redmine/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    pSelect.innerHTML = '<option value="">-- Select Project --</option>';

    if (data.projects && data.projects.length > 0) {
      const projectTree = buildProjectTree(data.projects);

      const renderOptions = (projects, level = 0) => {
        projects.forEach((p) => {
          const option = document.createElement("option");
          option.value = p.id;

          const indent = "\u00A0".repeat(level * 4);
          const prefix = level === 0 ? "📂 " : "";

          option.innerText = `${indent}${prefix}[${p.id}] ${p.name}`;

          if (level === 0) {
            option.style.fontWeight = "bold";
            option.style.backgroundColor = "#f8f9fa";
          }

          pSelect.appendChild(option);

          if (p.children && p.children.length > 0) {
            renderOptions(p.children, level + 1);
          }
        });
      };

      renderOptions(projectTree);
    }
  } catch (err) {
    console.error("Load modal projects error:", err);
    pSelect.innerHTML = '<option value="">Error loading projects</option>';
  }
}

export async function loadActivities() {
  const actSelect = document.getElementById("modalActivitySelect");
  const token = localStorage.getItem("app_token");

  try {
    const res = await fetch("/api/redmine/activities", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    actSelect.innerHTML = ""; // Xóa loading

    if (data.activities && data.activities.length > 0) {
      data.activities.forEach((act) => {
        const option = document.createElement("option");
        option.value = act.id;
        option.innerText = act.name;

        if (act.is_default) {
          option.selected = true;
        }

        actSelect.appendChild(option);
      });
    } else {
      actSelect.innerHTML = '<option value="">No activities found</option>';
    }
  } catch (err) {
    console.error("Load activities error:", err);
    actSelect.innerHTML = '<option value="">Error loading activities</option>';
  }
}

export async function loadStatuses() {
  const statusSelect = document.getElementById("modalStatusSelect");
  const token = localStorage.getItem("app_token");

  try {
    const res = await fetch("/api/redmine/statuses", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    statusSelect.innerHTML = "";
    data.statuses.forEach((s) => {
      const option = document.createElement("option");
      option.value = s.id;
      option.innerText = s.name;
      // Mặc định chọn "New" (thường ID = 1)
      if (s.id === 1) option.selected = true;
      statusSelect.appendChild(option);
    });
  } catch (err) {
    console.error("Load statuses error:", err);
  }
}

export async function loadStatusesForCreate() {
  const statusSelect = document.getElementById("modalStatusSelect");
  const token = localStorage.getItem("app_token");

  try {
    const res = await fetch("/api/redmine/statuses", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    statusSelect.innerHTML = "";

    // Tìm status có tên là "New" (thường ID là 1)
    const newStatus =
      data.statuses.find((s) => s.name.toLowerCase() === "new") ||
      data.statuses[0];

    if (newStatus) {
      const option = document.createElement("option");
      option.value = newStatus.id;
      option.innerText = newStatus.name;
      option.selected = true;
      statusSelect.appendChild(option);
    }

    // Khóa luôn dropdown này vì khi tạo mới chỉ có 1 lựa chọn duy nhất
    statusSelect.disabled = true;
    statusSelect.style.backgroundColor = "#edf2f7"; // Đổi màu nền để báo hiệu bị khóa
    statusSelect.style.cursor = "not-allowed";
  } catch (err) {
    console.error("Load statuses error:", err);
  }
}

//Handling create task

document.getElementById("btnCreateTask").onclick = async () => {
  const projectId = document.getElementById("modalProjectSelect").value;
  const selectedTaskId = document.getElementById("modalTaskSelect").value;

  if (!projectId) {
    alert("Please select Project first!");
    return;
  }

  // 1. Xác định Parent ID
  currentParentId = null;
  if (selectedTaskId) {
    const confirmSub = confirm(
      `Create SUB-TASK for #${selectedTaskId}?\n(Cancel to create Parent Task)`,
    );
    if (confirmSub) currentParentId = selectedTaskId;
  }

  if (selectedTaskId) {
    await loadEpicTypeOptions(selectedTaskId);
  }

  // 2. Hiện form nhập liệu và load Status
  document.getElementById("createTaskForm").style.display = "block";
  await loadStatusesForCreate();
};

// Logic khi bấm Nút "Create" thực sự trong form mới
document.getElementById("btnConfirmCreate").onclick = async () => {
  const subject = document.getElementById("newTaskSubject").value;
  const statusId = document.getElementById("modalStatusSelect").value;
  const epicTypeValue = document.getElementById("modalEpicTypeSelect").value;
  const projectId = document.getElementById("modalProjectSelect").value;

  if (!subject) {
    alert("Please input task title!");
    return;
  }

  const parentTask = orderedTasks.find((t) => t.id == selectedTaskId);
  if (parentTask && parentTask.custom_fields) {
    const field = parentTask.custom_fields.find(
      (cf) => cf.name === "Epic Type",
    );
    if (field) {
      EPIC_TYPE_ID = field.id;
    }
  }

  const payload = {
    project_id: projectId,
    subject: subject,
    parent_issue_id: currentParentId,
    status_id: statusId,
    assigned_to_id: "me",
    custom_fields: [
      {
        id: epicTypeId,
        value: epicTypeValue,
      },
    ],
  };

  try {
    const token = localStorage.getItem("app_token");
    const res = await fetch(`/api/redmine/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const newTask = await res.json();
      alert("✅ Created successfully!");

      // Reset & Ẩn form
      document.getElementById("newTaskSubject").value = "";
      document.getElementById("createTaskForm").style.display = "none";

      // Refresh danh sách task
      await fetchTasksByProject(projectId);
      document.getElementById("modalTaskSelect").value = newTask.id;
    }
  } catch (err) {
    alert("Failed to create task");
  }
};

// Nút Hủy
document.getElementById("btnCancelCreate").onclick = () => {
  document.getElementById("createTaskForm").style.display = "none";
};

// Hàm đổ dữ liệu vào Epic Type Select dựa trên Task cha đang được chọn
async function loadEpicTypeOptions(selectedTaskId) {
  const epicSelect = document.getElementById("modalEpicTypeSelect");
  epicSelect.innerHTML = '<option value="">-- Select Epic Type --</option>';

  // Tìm dữ liệu của task đang chọn trong danh sách orderedTasks (đã có custom_fields từ API getTasks)
  const taskData = orderedTasks.find((t) => t.id == selectedTaskId);
  console.log("check data", orderedTasks);

  if (taskData && taskData.custom_fields) {
    const epicField = taskData.custom_fields.find(
      (cf) => cf.name === "Epic Type",
    );

    if (epicField && epicField.possible_values) {
      epicField.possible_values.forEach((val) => {
        const opt = document.createElement("option");
        // Tùy theo cấu trúc API Redmine trả về, thường là val.value hoặc chính val
        opt.value = val.value || val;
        opt.innerText = val.label || val;
        epicSelect.appendChild(opt);
      });
    }
  }
}

/**
 * Render các option cho Epic Type dựa trên cấu trúc của Redmine
 */
function renderEpicOptions(field) {
  epicSelect.innerHTML = "";

  // Nếu field.value là một mảng (trong trường hợp Redmine cho chọn nhiều)
  // Hoặc là một chuỗi đơn lẻ
  if (field.value) {
    // Nếu Redmine trả về danh sách các giá trị khả thi (possible_values)
    if (field.possible_values) {
      field.possible_values.forEach((val) => {
        const opt = document.createElement("option");
        opt.value = val.value || val; // tùy cấu trúc API
        opt.innerText = val.label || val;

        // Nếu giá trị hiện tại của task trùng với option này thì chọn nó
        if (val === field.value || val.value === field.value) {
          opt.selected = true;
        }
        epicSelect.appendChild(opt);
      });
    } else {
      // Nếu không có list possible_values, chỉ hiển thị giá trị hiện tại (Read-only)
      const opt = document.createElement("option");
      opt.value = field.value;
      opt.innerText = field.value;
      opt.selected = true;
      epicSelect.appendChild(opt);
    }
  }
}
