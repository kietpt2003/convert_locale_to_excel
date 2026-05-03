export function initIdleHint() {
  if (sessionStorage.getItem("userGuideOpened")) return;

  const btnGuide = document.getElementById("btnOpenGuide");
  if (!btnGuide) return;

  // 1. Khởi tạo Overlay & Arrow
  let overlay = document.getElementById("idleSpotlightOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "idleSpotlightOverlay";
    document.body.appendChild(overlay);
  }

  let arrowBox = document.getElementById("guideHintArrow");
  if (!arrowBox) {
    arrowBox = document.createElement("div");
    arrowBox.id = "guideHintArrow";
    arrowBox.innerHTML = "👋 Need help? Click here!";
    document.body.appendChild(arrowBox);
  }

  let idleTimer;
  let clonedBtn = null; // Biến lưu trữ nút phân thân

  // 2. Hàm hiển thị Hint (Logic Clone)
  const showHint = () => {
    if (!sessionStorage.getItem("userGuideOpened")) {
      // Bật nền đen
      overlay.classList.add("active");
      arrowBox.classList.add("show");

      // Tính toán tọa độ chính xác của nút thật trên màn hình
      const rect = btnGuide.getBoundingClientRect();

      // Tạo một nút Clone y hệt nút thật
      clonedBtn = btnGuide.cloneNode(true);
      clonedBtn.id = "clonedGuideBtn";
      clonedBtn.classList.add("hint-spotlight-active");

      // Ép nút Clone nằm trôi nổi tự do, đè đúng vị trí nút thật
      clonedBtn.style.position = "fixed";
      clonedBtn.style.left = `${rect.left}px`;
      clonedBtn.style.top = `${rect.top}px`;
      clonedBtn.style.width = `${rect.width}px`;
      clonedBtn.style.height = `${rect.height}px`;
      clonedBtn.style.zIndex = "9999";
      clonedBtn.style.margin = "0"; // Xóa margin tránh bị lệch

      // Gắn thẳng vào Body (thoát khỏi mọi sự che khuất)
      document.body.appendChild(clonedBtn);

      // Khi người dùng bấm vào nút Clone -> Đóng Hint và mở Modal Guide thật
      clonedBtn.addEventListener("click", finalizeHint);
    }
  };

  // 3. Hàm reset (Xóa Clone và đếm lại thời gian)
  const resetTimer = () => {
    arrowBox.classList.remove("show");
    overlay.classList.remove("active");

    // Nếu đang có nút Clone thì xóa nó đi
    if (clonedBtn) {
      clonedBtn.remove();
      clonedBtn = null;
    }

    clearTimeout(idleTimer);

    if (!sessionStorage.getItem("userGuideOpened")) {
      idleTimer = setTimeout(showHint, 5000); // Kích hoạt sau 5s
    }
  };

  // 4. Lắng nghe thao tác
  ["mousemove", "keydown", "click", "scroll"].forEach((event) => {
    window.addEventListener(event, resetTimer, true);
  });

  // 5. Hàm kết thúc vĩnh viễn Hint
  const finalizeHint = () => {
    sessionStorage.setItem("userGuideOpened", "true"); // Đánh dấu đã mở
    clearTimeout(idleTimer);
    resetTimer(); // Ẩn mọi thứ
    btnGuide.click(); // Mượn tay JS bấm vào nút User Guide thật
  };

  // Bắt đầu đếm
  resetTimer();
}
