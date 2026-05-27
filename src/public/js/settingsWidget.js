// File: settingsWidget.js

export function initSettingsWidget(options = {}) {
  // Cấu hình vị trí mặc định là góc dưới bên phải nếu không truyền vào
  const top = options.top || "auto";
  const bottom = options.bottom || "auto";
  const left = options.left || "auto";
  const right = options.right || "auto";

  // 1. SINH CSS ĐỘNG CHO WIDGET & MODAL
  if (!document.getElementById("settings-widget-css")) {
    const style = document.createElement("style");
    style.id = "settings-widget-css";
    style.innerHTML = `
      /* Nút Settings trôi nổi */
      .st-floating-btn {
        position: fixed;
        width: 64px;
        height: 64px;
        background-color: black;
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 99990;
        transition: transform 0.2s, background 0.2s;
      }
      .st-floating-btn:hover {
        transform: scale(1.1) rotate(45deg);
        background-color: #334155;
      }

      /* Màn hình mờ phía sau Modal (Overlay) */
      .st-modal-overlay {
        position: fixed;
        top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0,0,0,0.5);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        opacity: 0;
        transition: opacity 0.3s;
      }
      .st-modal-overlay.show {
        display: flex;
        opacity: 1;
      }

      /* Hộp thoại Modal */
      .st-modal-box {
        background: white;
        width: 90%;
        max-width: 400px;
        border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        overflow: hidden;
        font-family: sans-serif;
        transform: translateY(20px);
        transition: transform 0.3s;
      }
      .st-modal-overlay.show .st-modal-box {
        transform: translateY(0);
      }

      /* Header Modal */
      .st-modal-header {
        padding: 16px 20px;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: bold;
        font-size: 18px;
        color: #0f172a;
      }
      .st-close-btn {
        cursor: pointer;
        color: #64748b;
        font-size: 20px;
        line-height: 1;
      }
      .st-close-btn:hover { color: #ef4444; }

      /* Nội dung Modal */
      .st-modal-body {
        padding: 20px;
        min-height: 150px;
        position: relative;
      }

      /* Các View trong Modal */
      .st-view { display: none; }
      .st-view.active { display: block; }

      /* Nút chọn tính năng */
      .st-menu-btn, .st-cursor-btn {
        width: 100%;
        padding: 12px 16px;
        margin-bottom: 10px;
        background: #f1f5f9;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        text-align: left;
        font-size: 16px;
        color: #334155;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
      }
      .st-menu-btn:hover, .st-cursor-btn:hover {
        background: #e2e8f0;
        border-color: #94a3b8;
      }
      
      .st-back-btn {
        margin-bottom: 15px;
        color: #3b82f6;
        cursor: pointer;
        font-size: 14px;
        display: inline-block;
      }
      .st-back-btn:hover { text-decoration: underline; }
    `;
    document.head.appendChild(style);
  }

  // 2. SINH HTML CHO WIDGET VÀ MODAL
  if (!document.getElementById("st-widget-container")) {
    const container = document.createElement("div");
    container.id = "st-widget-container";
    container.innerHTML = `
      <div id="st-floating-btn" class="st-floating-btn" style="top: ${top}; bottom: ${bottom}; left: ${left}; right: ${right};">
        ⚙️
      </div>

      <div id="st-modal-overlay" class="st-modal-overlay">
        <div class="st-modal-box" onclick="event.stopPropagation()">
          
          <div class="st-modal-header">
            <span id="st-modal-title">Settings</span>
            <span id="st-close-btn" class="st-close-btn">✖</span>
          </div>

          <div class="st-modal-body">
            
            <div id="st-view-main" class="st-view active">
              <button id="st-btn-feature-cursor" class="st-menu-btn">
                🖱️ Change mouse cursor
              </button>
            </div>

            <div id="st-view-cursor" class="st-view">
              <div id="st-btn-back-main" class="st-back-btn">⬅ Back to Menu</div>
              
              <button class="st-cursor-btn" data-pack="system">System Default</button>
              <button class="st-cursor-btn" data-pack="lizardmeme">Lizard Meme</button>
              <button class="st-cursor-btn" data-pack="catknife">Cat Knife</button>
              <button class="st-cursor-btn" data-pack="cathand">Cat Hand</button>
              <button class="st-cursor-btn" data-pack="catshark">Cat Shark</button>
              <button class="st-cursor-btn" data-pack="kawaiicat">Kawaii Cat</button>
              <button class="st-cursor-btn" data-pack="hellokitty">Hello Kitty</button>
            </div>

          </div>
        </div>
      </div>
    `;
    document.body.appendChild(container);
  }

  // 3. LOGIC XỬ LÝ SỰ KIỆN (JAVASCRIPT)
  const btnSettings = document.getElementById("st-floating-btn");
  const modalOverlay = document.getElementById("st-modal-overlay");
  const btnClose = document.getElementById("st-close-btn");

  const viewMain = document.getElementById("st-view-main");
  const viewCursor = document.getElementById("st-view-cursor");
  const modalTitle = document.getElementById("st-modal-title");

  const btnFeatureCursor = document.getElementById("st-btn-feature-cursor");
  const btnBackMain = document.getElementById("st-btn-back-main");
  const cursorOptions = document.querySelectorAll(".st-cursor-btn");

  // Đóng / Mở Modal
  const openModal = () => modalOverlay.classList.add("show");
  const closeModal = () => modalOverlay.classList.remove("show");

  btnSettings.addEventListener("click", openModal);
  btnClose.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", closeModal); // Bấm ra ngoài mờ mờ cũng đóng

  // Chuyển view: Sang màn hình chọn chuột
  btnFeatureCursor.addEventListener("click", () => {
    viewMain.classList.remove("active");
    viewCursor.classList.add("active");
    modalTitle.innerText = "Mouse Cursor";
  });

  // Chuyển view: Quay lại Menu chính
  btnBackMain.addEventListener("click", () => {
    viewCursor.classList.remove("active");
    viewMain.classList.add("active");
    modalTitle.innerText = "Settings";
  });

  // Xử lý khi user chọn một con chuột
  cursorOptions.forEach((btn) => {
    btn.addEventListener("click", function () {
      const packId = this.getAttribute("data-pack");

      // Gọi hàm setCursorPack từ file customCursor.js
      if (typeof window.setCursorPack === "function") {
        window.setCursorPack(packId);
      } else {
        console.error(
          "Lỗi: Không tìm thấy hàm setCursorPack. Bạn đã nhúng file customCursor.js chưa?",
        );
      }

      // Chọn xong thì đóng modal luôn cho mượt
      closeModal();
    });
  });
}
