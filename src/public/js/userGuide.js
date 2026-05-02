// =========================================================
// 1. DỮ LIỆU HƯỚNG DẪN (Thêm/Sửa tab ở đây)
// =========================================================
const GUIDE_DATA = [
  {
    id: "quick_drafts",
    tabName: "📝 Quick Drafts",
    steps: [
      {
        title: "Tạo bản nháp công việc",
        text: "Nhập nội dung, chọn Activity và số giờ, sau đó bấm Add. Công việc sẽ được lưu tạm ở cột bên trái.",
        image:
          "https://placehold.co/600x300/f8fafc/475569?text=Nhập+Thông+Tin+Draft",
      },
      {
        title: "Kéo thả để Log Time",
        text: "Chỉ cần nắm kéo bản nháp (Drag) và thả (Drop) vào ô tương ứng trong bảng chấm công. Rất nhanh và tiện!",
        image:
          "https://placehold.co/600x300/f8fafc/475569?text=Kéo+Thả+Vào+Bảng",
      },
    ],
  },
  {
    id: "project_tree",
    tabName: "🌳 Project & Task Tree",
    steps: [
      {
        title: "Duyệt cây dự án",
        text: "Hệ thống sẽ hiển thị toàn bộ dự án và task của bạn dưới dạng cây phân cấp. Bấm mũi tên để mở rộng.",
        image: "https://placehold.co/600x300/f8fafc/475569?text=Cây+Phân+Cấp",
      },
      {
        title: "Tìm kiếm thông minh",
        text: "Sử dụng thanh tìm kiếm, hệ thống sẽ tự động lọc đệ quy và giữ lại cấu trúc cha-con cho bạn.",
        image: "https://placehold.co/600x300/f8fafc/475569?text=Lọc+Dữ+Liệu",
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
  els.text.innerText = currentStep.text;
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
  els.btnOpen = document.getElementById("btnOpenGuide"); // Nút trigger mở modal

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

  // Bấm vào vùng nền xám để đóng
  els.modal.addEventListener("click", (e) => {
    if (e.target === els.modal) closeUserGuide();
  });

  // Gắn sự kiện cho nút mở Modal (nếu có)
  if (els.btnOpen) {
    els.btnOpen.onclick = openUserGuide;
  }
}
