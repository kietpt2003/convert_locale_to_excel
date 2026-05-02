// =========================================================
// 1. DỮ LIỆU HƯỚNG DẪN (Thêm/Sửa tab ở đây)
// =========================================================
const GUIDE_DATA = [
  {
    id: "quick_drafts",
    tabName: "📝 Quick Drafts",
    steps: [
      {
        title: "Quick Drafts Overview",
        text: "The Quick Drafts feature acts as your personal notepad and staging area for time tracking. If you are planning your day or have recurring tasks, you can quickly jot down the task subject, activity type, and estimated hours without committing them to Redmine right away. These drafts sit conveniently in a dedicated sidebar on your dashboard. When you are ready, simply drag a draft and drop it directly into your timesheet, drastically speeding up your daily time-logging routine and reducing repetitive data entry.",
        image: "assets/quick_drafts_guide_1.png",
      },
      {
        title: "Rapid Draft Creation",
        text: `Skip the full log-time modal when you are in a hurry. Just enter a brief subject, select an activity from the dropdown, define the hours, and hit "Add". Your draft is instantly saved to your personal list, serving as a placeholder until you are ready to officially log the time.`,
        image: "assets/quick_drafts_guide_2.png",
      },
      {
        title: "Intuitive Drag-and-Drop Workflow",
        text: `This is the core magic of Quick Drafts. Simply click and hold any draft from your list, drag it across the screen, and drop it onto the corresponding target (like a specific task in Project Explorer). The system automatically captures the draft's pre-filled details and logs the time for you, creating a frictionless, highly visual workflow.`,
        image: "assets/quick_drafts_guide_3.png",
      },
      {
        title: "Smart Search & Management",
        text: `Accumulating a lot of drafts? Use the built-in search bar to instantly filter your list. The system uses a smart partial-match algorithm to highlight keywords in the task subject, activity name, or date. You can also quickly discard completed or outdated drafts with a single click to keep your workspace clean and organized.`,
        image: "assets/quick_drafts_guide_4.png",
      },
    ],
  },
  {
    id: "calendar",
    tabName: "📅 Calendar",
    steps: [
      {
        title: "Calendar Overview",
        text: "The Calendar tab provides a visual and comprehensive overview of your Redmine time-tracking data. It is designed to help users effortlessly monitor their logged hours, daily activities, and overall monthly progress through an intuitive, color-coded calendar interface.",
        image: "assets/calendar_guide_1.png",
      },
      {
        title: "Visual Monthly Tracking & Color-coding",
        text: "Displays all logtime entries directly on a monthly calendar grid. Each day is intelligently color-coded (e.g., highlighting full days vs. incomplete days) to instantly indicate whether you have fulfilled your required daily working hours. This eliminates the guesswork and provides a quick visual health-check of your timesheet.",
        image: "assets/calendar_guide_2.png",
      },
      {
        title: "Daily Time Totals & Badges",
        text: "Calculates the total hours logged per day and highlights them using clear visual badges on each specific calendar date. This allows you to immediately pinpoint days with missing entries or overtime without needing to manually add up individual task durations.",
        image: "assets/calendar_guide_3.png",
      },
      {
        title: "Monthly Progress & Aggregate Tracking",
        text: "Automatically calculates the maximum required working hours for the selected month (automatically excluding weekends) and compares it with your total logged hours. A dynamic progress bar provides a real-time visual indicator of your overall monthly completion, changing colors as you reach your workload target.",
        image: "assets/calendar_guide_4.png",
      },
      {
        title: "Detailed Task Logs & Smart Tooltips",
        text: "Shows the precise breakdown of tasks logged on any given day, including Project Name, Hours spent, and specific Comments. It features a smart global hover tooltip to read long descriptions without cluttering the UI, alongside clickable Issue IDs that navigate you directly to the corresponding Redmine ticket for seamless workflow management.",
        image: "assets/calendar_guide_5.png",
      },
      {
        title: "One-click Acccess To Your Redmine Tasks",
        text: "Task IDs are embedded as quick links within your daily logs. Whenever you need more context about a specific entry, simply click the Task ID. The browser will instantly route you to that exact ticket on your company's Redmine workspace, ensuring a frictionless transition between reviewing timesheets and managing project details.",
        image: "assets/calendar_guide_6.png",
      },
    ],
  },
  {
    id: "project_tree",
    tabName: "🌳 Project Explorer",
    steps: [
      {
        title: "Project Explorer Overview",
        text: "Serving as the primary navigation hub of the application, the Project Explorer transforms complex Redmine data into an intuitive tree structure. It allows users to quickly search for projects, view detailed task lists, and filter personal assignments. By combining modern data caching technology with a client-side local search engine, this feature ensures instant response times, even when handling large datasets.",
        image: "assets/project_explorer_guide_1.png",
      },
      {
        title: "Hierarchical Project & Task Tree",
        text: "Automatically organizes projects, sub-projects, and tasks to match their exact hierarchy on your company's Redmine. Users can seamlessly expand or collapse individual branches to focus on specific work areas, helping you maintain a clear big-picture view without being overwhelmed by cluttered information.",
        image: "assets/project_explorer_guide_2.png",
      },
      {
        title: `Personalized "Only My Tasks" Filter`,
        text: "When activated, the system performs a recursive filter to display only the tasks where you are the designated Assignee. Crucially, this smart filter preserves the parent projects and parent tasks associated with your assignments, ensuring you always understand the context of your daily workload.",
        image: "assets/project_explorer_guide_3.png",
      },
      {
        title: `Smart Local Search`,
        text: "The search engine operates directly on the data already loaded into your browser. As you type a keyword, the system instantly scans all project titles and task IDs to display matching results. This feature is optimized to automatically expand the tree branches containing the matched items, helping you locate your work in a matter of seconds.",
        image: "assets/project_explorer_guide_4.png",
      },
      {
        title: `Important Usage Notes`,
        text: `<strong>Data Refresh & Caching Mechanism</strong><br/>
  • To guarantee blazing-fast loading speeds on the Cloud environment, the system utilizes <strong>Redis Caching</strong> to temporarily store user-specific data.<br/><br/>
  • <strong>Cache Duration:</strong> Once loaded for the first time, your project data is "memorized" for <strong style="color: red;">5 minutes</strong>. During this window, navigating the app or switching tabs will instantly display the cached data without making you wait for the Redmine server to process the request.<br/><br/>
  • <strong>Fetching New Data:</strong> If there are recent changes on Redmine (e.g., a newly assigned task or a renamed project) that are not yet reflected in the app, simply click the <strong>Refresh button</strong>. This action will forcefully clear your old cache and fetch the latest data directly from the Redmine API.<br/><br/>
  <strong>Local Search Workflow</strong><br/>
  A key technical distinction to keep in mind: <strong>The search and filtering features are executed entirely locally on your machine.</strong><br/><br/>
  • When you type a keyword into the Search box or toggle display options, the application <strong style="color: red;">does not make new API calls</strong> to the server.<br/><br/>
  • This local-processing logic saves bandwidth, reduces server load, and most importantly, delivers a smooth, zero-latency experience while you search. The app will only reach out to the server to fetch new data when you manually click the Refresh button or when the 5-minute cache expires.<br/><br/>`,
        image: "assets/project_explorer_guide_5.png",
      },
      {
        title: `Quick Logtime`,
        text: `This feature is designed for maximum efficiency, allowing you to record work hours without navigating away from your current view. When your cursor moves over a specific task, a <strong>Quick Logtime icon</strong> (usually a clock or plus sign) will be revealed. Clicking this icon immediately triggers the log-time modal for that exact task, pre-filling the project and task details so you can focus solely on entering your hours and comments.`,
        image: "assets/project_explorer_guide_6.png",
      },
      {
        title: `Using the Quick Log Time Modal`,
        text: `• <strong>Pre-filled Accuracy:</strong> The modal automatically pre-fills the Project and Task details based on your selection, eliminating manual entry errors.<br/><br/>
  • <strong>Streamlined Inputs:</strong> Simply select the <strong>Date</strong>, input your <strong>Hours</strong>, choose an <strong>Activity Type</strong>, and add an optional <strong>Comment</strong>.<br/><br/>
  • <strong>Uninterrupted Workflow:</strong> Click <strong>Submit Log</strong> to instantly sync the data with Redmine. The modal closes immediately, bringing you exactly back to where you left off in the project tree.`,
        image: "assets/project_explorer_guide_7.png",
      },
    ],
  },
  {
    id: "task_creation",
    tabName: "🆕 Task Creation",
    steps: [
      {
        title: "Task Creation Overview",
        text: "Instead of navigating through multiple complex menus on the native Redmine interface, this feature centralizes the entire task creation process into a single, focused screen. Users can easily define the target project, configure essential details like Tracker, Subject, and Description, and flexibly link new entries as Sub-tasks to an existing parent task. This ensures your workload hierarchy remains well-organized and easy to manage.",
        image: "assets/task_creation_guide_1.png",
      },
      {
        title: "Smart Target Project Selection",
        text: "Features a real-time project search engine. Simply type a partial project name or ID, and the system will automatically display hierarchical suggestions. The interface is highly optimized to completely eliminate native browser autofill interference, ensuring you select the correct target project accurately and smoothly.",
        image: "assets/task_creation_guide_2.png",
      },
      {
        title: `Sub-task Linkage Support`,
        text: "This feature is a powerful tool for breaking down large work items. You can designate an existing issue as the Parent Task, and the system will automatically link your new entry as its sub-task. This ensures complex deliverables are systematically organized and tracked right from their inception.",
        image: "assets/task_creation_guide_3.png",
      },
      {
        title: `Standard Field Customization (Tracker, Priority, Assignee)`,
        text: `You have full control over critical task attributes including the <strong>Tracker</strong> (e.g., Bug, Feature, Support), <strong>Priority</strong> level, and <strong>Assignee</strong>. Supporting these standard fields guarantees that your new tasks perfectly comply with your company's existing project management workflows.`,
        image: "assets/task_creation_guide_4.png",
      },
    ],
  },
  {
    id: "spent_time_report",
    tabName: "📊 Spent Time Report",
    steps: [
      {
        title: "Spent Time Report Overview",
        text: "The Spent Time Report is an analytical dashboard designed to give you deep insights into exactly where your time goes. It allows you to generate detailed summaries of your logged hours across different projects, tasks, and custom date ranges. Whether you need to review your weekly productivity, verify timesheets for payroll, or analyze billable hours, this report provides a clean, filterable, and highly accurate view of your entire work history on Redmine.",
        image: "assets/spent_time_report_guide_1.png",
      },
      {
        title: "Custom Date & Range Filtering",
        text: `Flexibly define the exact period you want to analyze. You can utilize quick presets (such as "This Week" or "Last Month") for instant reviews, or select precise custom start and end dates through the calendar picker to generate highly targeted time reports.`,
        image: "assets/spent_time_report_guide_2.png",
      },
      {
        title: `Advanced Data Grouping & Insights`,
        text: "Organize your time data exactly how you need to see it. The report allows you to categorize entries by Project to monitor overall time budgets, by Task to analyze specific issue efforts, or by Activity (e.g., Development, Design, Testing) to understand the distribution of your daily workflow.",
        image: "assets/spent_time_report_guide_3.png",
      },
      {
        title: `Detailed Log Breakdown & Auditing`,
        text: `Drill down into the specifics. The report doesn't just display aggregate totals; it lists every individual log entry complete with your exact hours spent. This ensures full transparency and allows you to quickly audit or cross-reference your timesheets with the original Redmine tickets.`,
        image: "assets/spent_time_report_guide_4.png",
      },
    ],
  },
];

// =========================================================
// 2. BIẾN STATE VÀ DOM ELEMENTS
// =========================================================
let currentTabIndex = 0;
let currentStepIndex = 0;

// Gom các DOM elements vào một object để quản lý
const els = {};

// =========================================================
// 3. CÁC HÀM RENDER & LOGIC
// =========================================================

function renderTabs() {
  els.tabList.innerHTML = "";
  GUIDE_DATA.forEach((guide, index) => {
    const li = document.createElement("li");
    li.className = `guide-tab-item ${index === currentTabIndex ? "active" : ""}`;
    li.innerText = guide.tabName;
    li.onclick = () => {
      currentTabIndex = index;
      currentStepIndex = 0; // Reset về step 1 của tab mới
      renderTabs();
      renderStep();
    };
    els.tabList.appendChild(li);
  });
}

function renderStep() {
  const currentGuide = GUIDE_DATA[currentTabIndex];
  const totalSteps = currentGuide.steps.length;
  const currentStep = currentGuide.steps[currentStepIndex];

  // Update nội dung
  els.title.innerText = `${currentStepIndex + 1}. ${currentStep.title}`;
  els.text.innerHTML = currentStep.text;
  els.image.src = currentStep.image;

  // Update dots tiến trình
  els.dots.innerHTML = "";
  for (let i = 0; i < totalSteps; i++) {
    const dot = document.createElement("div");
    dot.className = `guide-dot ${i === currentStepIndex ? "active" : ""}`;
    els.dots.appendChild(dot);
  }

  // Ẩn/Hiện nút bấm
  els.btnPrev.style.visibility = currentStepIndex === 0 ? "hidden" : "visible";

  if (currentStepIndex === totalSteps - 1) {
    els.btnNext.style.display = "none";
    els.btnDone.style.display = "block";
  } else {
    els.btnNext.style.display = "block";
    els.btnDone.style.display = "none";
  }
}

function handlePrev() {
  if (currentStepIndex > 0) {
    currentStepIndex--;
    renderStep();
  }
}

function handleNext() {
  if (currentStepIndex < GUIDE_DATA[currentTabIndex].steps.length - 1) {
    currentStepIndex++;
    renderStep();
  }
}

export function closeUserGuide() {
  if (els.modal) els.modal.classList.remove("active");
}

// Bộc lộ hàm này ra ngoài luôn nếu bạn muốn mở Modal từ một nút bất kỳ khác bằng code
export function openUserGuide() {
  if (!els.modal) return;
  currentTabIndex = 0;
  currentStepIndex = 0;
  renderTabs();
  renderStep();
  els.modal.classList.add("active");
}

// =========================================================
// 4. HÀM KHỞI TẠO (INIT) ĐỂ GỌI TỪ NƠI KHÁC
// =========================================================
export function initUserGuide() {
  // Query toàn bộ DOM Elements
  els.modal = document.getElementById("userGuideModal");
  els.tabList = document.getElementById("guideTabs");
  els.title = document.getElementById("guideTitle");
  els.text = document.getElementById("guideText");
  els.image = document.getElementById("guideImage");
  els.dots = document.getElementById("guideDots");
  els.btnPrev = document.getElementById("guideBtnPrev");
  els.btnNext = document.getElementById("guideBtnNext");
  els.btnDone = document.getElementById("guideBtnDone");
  els.btnClose = document.getElementById("btnCloseGuide");
  els.btnOpen = document.getElementById("btnOpenGuide");
  els.fullImgOverlay = document.getElementById("guideImgFullOverlay");
  els.fullImgTag = document.getElementById("guideImgFull");

  // Kiểm tra an toàn: Nếu HTML của modal chưa có thì không chạy tiếp để tránh lỗi
  if (!els.modal) {
    console.warn("User Guide Modal không tồn tại trong DOM!");
    return;
  }

  // Gán Event Listeners
  els.btnPrev.onclick = handlePrev;
  els.btnNext.onclick = handleNext;
  els.btnDone.onclick = closeUserGuide;
  els.btnClose.onclick = closeUserGuide;

  els.image.onclick = () => {
    const src = els.image.src;
    if (src) {
      els.fullImgTag.src = src;
      els.fullImgOverlay.classList.add("active");
    }
  };

  const closeFullImg = () => els.fullImgOverlay.classList.remove("active");
  els.fullImgOverlay.onclick = closeFullImg;

  // Bấm vào vùng nền xám để đóng
  els.modal.addEventListener("click", (e) => {
    if (e.target === els.modal) closeUserGuide();
  });

  // Gắn sự kiện cho nút mở Modal (nếu có)
  if (els.btnOpen) {
    els.btnOpen.onclick = openUserGuide;
  }
}
