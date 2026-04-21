import { renderCalendar } from "./calendar.js";
import { buildProjectTree } from "./redmine.js";

let orderedTasks = [];

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

  // Listening on change project event
  pSelect.onchange = (e) => {
    const projectId = e.target.value;
    fetchTasksByProject(projectId);
  };

  btnSubmit.onclick = async () => {
    const taskId = document.getElementById("modalTaskSelect").value;
    const hours = document.getElementById("modalHours").value;
    const projectId = pSelect.value;

    const logDate = window.currentSelectedDate;

    if (!projectId || !taskId || !hours || hours <= 0) {
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
        }),
      });

      const result = await res.json();

      if (res.ok) {
        alert("✅ Logged successfully!");
        modal.style.display = "none";

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

//Handling create task
document.getElementById("btnCreateTask").onclick = async () => {
  const projectId = document.getElementById("modalProjectSelect").value;
  const taskSelect = document.getElementById("modalTaskSelect");
  const selectedTaskId = taskSelect.value;

  if (!projectId) {
    alert("Please select Project first!");
    return;
  }

  const selectedTaskData = orderedTasks.find((t) => t.id == selectedTaskId);

  let parentId = null;
  let promptMsg = "Input task title:";

  if (selectedTaskId) {
    // Nếu đang chọn một task, mặc định hiểu là muốn tạo sub-task cho nó
    const parentName = selectedTaskData
      ? selectedTaskData.subject
      : selectedTaskId;
    const confirmSub = confirm(
      `You're selected task #${selectedTaskId}.\n\nAre you going to create SUB-TASK for this task?\n(Press Cancel to create Task seperately)`,
    );

    if (confirmSub) {
      parentId = selectedTaskId;
      promptMsg = `Input Sub-task title for [#${selectedTaskId}]:`;
    }
  }

  const taskSubject = prompt(promptMsg);
  if (!taskSubject) return;

  try {
    const token = localStorage.getItem("app_token");
    const res = await fetch(`/api/redmine/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        project_id: projectId,
        subject: taskSubject,
        parent_issue_id: parentId,
        assigned_to_id: "me",
      }),
    });

    if (res.ok) {
      const newTask = await res.json();
      alert(`Đã tạo ${parentId ? "Sub-task" : "Task"} thành công!`);
      await fetchTasksByProject(projectId); // Refresh tasks list
      document.getElementById("modalTaskSelect").value = newTask.id; // Select task just created
    }
  } catch (err) {
    alert("Create task failed. Please try again later");
  }
};
