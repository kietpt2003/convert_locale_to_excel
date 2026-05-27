// File: settingsWidget.js

export function initSettingsWidget(options = {}) {
  const top = options.top || "auto";
  const bottom = options.bottom || "auto";
  const left = options.left || "auto";
  const right = options.right || "auto";

  // 1. SINH CSS ĐỘNG CHO WIDGET & MODAL
  if (!document.getElementById("settings-widget-css")) {
    const style = document.createElement("style");
    style.id = "settings-widget-css";
    style.innerHTML = `
      .st-floating-btn {
        position: fixed; width: 64px; height: 64px; background-color: black; color: white; border-radius: 50%;
        display: flex; align-items: center; justify-content: center; font-size: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 99990; transition: transform 0.2s, background 0.2s;
      }
      .st-floating-btn:hover { transform: scale(1.1) rotate(45deg); background-color: #334155; }

      .st-modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); display: none; align-items: center; justify-content: center; z-index: 99999; opacity: 0; transition: opacity 0.3s; }
      .st-modal-overlay.show { display: flex; opacity: 1; }

      /* 👉 MODAL PHÓNG TO & ĐỔI GIAO DIỆN DARK TƯƠNG TỰ SWEEZY */
      .st-modal-box { background: #2f3136; width: 95%; max-width: 850px; max-height: 90vh; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); overflow: hidden; font-family: sans-serif; transform: translateY(20px); transition: transform 0.3s; display: flex; flex-direction: column;}
      .st-modal-overlay.show .st-modal-box { transform: translateY(0); }

      .st-modal-header { padding: 16px 20px; background: #202225; border-bottom: 1px solid #18191c; display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 18px; color: #ffffff; }
      .st-close-btn { cursor: pointer; color: #b9bbbe; font-size: 20px; }
      .st-close-btn:hover { color: #ef4444; }

      .st-modal-body { padding: 20px; flex: 1; overflow-y: auto; color: white; }
      .st-view { display: none; }
      .st-view.active { display: block; }

      .st-menu-btn { width: 100%; padding: 16px; margin-bottom: 10px; background: #40444b; border: none; border-radius: 8px; text-align: left; font-size: 16px; color: #ffffff; cursor: pointer; transition: background 0.2s; font-weight: bold;}
      .st-menu-btn:hover { background: #4f545c; }
      .st-back-btn { margin-bottom: 15px; color: #5865f2; cursor: pointer; font-size: 15px; display: inline-block; font-weight: 600;}
      .st-back-btn:hover { text-decoration: underline; }

      /* 👉 UI CHO CATEGORY TABS */
      .st-category-nav { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 15px; margin-bottom: 15px; border-bottom: 1px solid #40444b; }
      .st-category-nav::-webkit-scrollbar { height: 6px; }
      .st-category-nav::-webkit-scrollbar-thumb { background: #4f545c; border-radius: 10px; }
      .st-cat-tab { padding: 8px 16px; background: transparent; border: none; color: #b9bbbe; font-weight: bold; font-size: 14px; cursor: pointer; border-radius: 20px; white-space: nowrap; transition: 0.2s;}
      .st-cat-tab:hover { background: #40444b; color: white; }
      .st-cat-tab.active { background: #5865f2; color: white; }

      /* 👉 UI CHO GRID CHUỘT (SWEEZY STYLE) */
      .st-cursor-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
      .st-cursor-card { background: #36393f; border: 1px solid #202225; border-radius: 12px; padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 15px; transition: transform 0.2s, box-shadow 0.2s; position: relative;}
      .st-cursor-card:hover { transform: translateY(-4px); box-shadow: 0 8px 15px rgba(0,0,0,0.2); }
      .st-cursor-title { font-size: 14px; font-weight: 600; text-align: center; color: #ffffff; min-height: 34px;}
      .st-cursor-preview { display: flex; gap: 15px; justify-content: center; align-items: center; height: 70px; width: 100%;}
      .st-cursor-preview img { width: 40px; height: 40px; object-fit: contain; filter: drop-shadow(0 4px 4px rgba(0,0,0,0.4)); animation: float 3s ease-in-out infinite;}
      .st-apply-btn { background: #9b59b6; color: white; border: none; border-radius: 20px; padding: 8px 30px; font-weight: bold; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; gap: 5px;}
      .st-apply-btn:hover { background: #8e44ad; }
      .st-apply-btn.active { background: #2ecc71; }
      
      @keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-5px); } 100% { transform: translateY(0px); } }
    `;
    document.head.appendChild(style);
  }

  // 2. SINH HTML CHO WIDGET VÀ MODAL
  if (!document.getElementById("st-widget-container")) {
    const container = document.createElement("div");
    container.id = "st-widget-container";
    container.innerHTML = `
      <div id="st-floating-btn" class="st-floating-btn cursor-pointer" role="button" style="top: ${top}; bottom: ${bottom}; left: ${left}; right: ${right};">
        ⚙️
      </div>

      <div id="st-modal-overlay" class="st-modal-overlay">
        <div class="st-modal-box" onclick="event.stopPropagation()">
          
          <div class="st-modal-header">
            <span id="st-modal-title">Settings</span>
            <span id="st-close-btn" class="st-close-btn cursor-pointer" role="button">✖</span>
          </div>

          <div class="st-modal-body">
            
            <div id="st-view-main" class="st-view active">
              <button id="st-btn-feature-cursor" class="st-menu-btn cursor-pointer">
                🖱️ Custom Mouse Cursors
              </button>
            </div>

            <div id="st-view-cursor" class="st-view">
              <div id="st-btn-back-main" class="st-back-btn cursor-pointer" role="button">⬅ Back to Settings</div>
              
              <div id="st-category-nav" class="st-category-nav"></div>
              
              <div id="st-cursor-grid" class="st-cursor-grid"></div>
            </div>

          </div>
        </div>
      </div>
    `;
    document.body.appendChild(container);
  }

  // 3. LOGIC XỬ LÝ SỰ KIỆN VÀ RENDER ĐỘNG
  const btnSettings = document.getElementById("st-floating-btn");
  const modalOverlay = document.getElementById("st-modal-overlay");
  const btnClose = document.getElementById("st-close-btn");
  const viewMain = document.getElementById("st-view-main");
  const viewCursor = document.getElementById("st-view-cursor");
  const modalTitle = document.getElementById("st-modal-title");
  const btnFeatureCursor = document.getElementById("st-btn-feature-cursor");
  const btnBackMain = document.getElementById("st-btn-back-main");

  const categoryNav = document.getElementById("st-category-nav");
  const cursorGrid = document.getElementById("st-cursor-grid");

  let currentCategory = "All";

  // Hàm render UI Động dựa trên dữ liệu từ window.CURSOR_PACKS
  const renderCursorUI = () => {
    if (!window.CURSOR_PACKS) return;
    const packs = window.CURSOR_PACKS;

    // Lấy danh sách Categories độc nhất
    const categories = [
      "All",
      ...new Set(Object.values(packs).map((p) => p.category)),
    ];

    // Render Tabs
    categoryNav.innerHTML = categories
      .map(
        (cat) =>
          `<button class="st-cat-tab cursor-pointer ${cat === currentCategory ? "active" : ""}" data-cat="${cat}">${cat}</button>`,
      )
      .join("");

    // Bắt sự kiện chuyển Tab
    document.querySelectorAll(".st-cat-tab").forEach((tab) => {
      tab.addEventListener("click", function () {
        currentCategory = this.getAttribute("data-cat");
        renderCursorUI(); // Render lại Grid
      });
    });

    // Render Grid Cards
    const savedPackId = localStorage.getItem("saved_cursor") || "system";
    let gridHTML = "";

    Object.keys(packs).forEach((packId) => {
      const pack = packs[packId];
      if (currentCategory === "All" || pack.category === currentCategory) {
        const isApplied = savedPackId === packId;
        gridHTML += `
          <div class="st-cursor-card">
            <div class="st-cursor-title">${pack.name}</div>
            <div class="st-cursor-preview">
              <img src="${pack.default}" alt="default" title="Normal Cursor"/>
              <img src="${pack.pointer}" alt="pointer" title="Pointer Cursor"/>
            </div>
            <button class="st-apply-btn cursor-pointer ${isApplied ? "active" : ""}" data-pack="${packId}">
              ${isApplied ? "Applied" : "Set"}
            </button>
          </div>
        `;
      }
    });

    cursorGrid.innerHTML = gridHTML;

    // Bắt sự kiện click nút Add+
    document.querySelectorAll(".st-apply-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        const packId = this.getAttribute("data-pack");
        if (window.setCursorPack) window.setCursorPack(packId);
        renderCursorUI(); // Re-render để cập nhật nút chữ "Applied" màu xanh
      });
    });
  };

  const openModal = () => modalOverlay.classList.add("show");
  const closeModal = () => modalOverlay.classList.remove("show");

  btnSettings.addEventListener("click", openModal);
  btnClose.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", closeModal);

  btnFeatureCursor.addEventListener("click", () => {
    viewMain.classList.remove("active");
    viewCursor.classList.add("active");
    modalTitle.innerText = "Mouse Cursor Hub";
    renderCursorUI(); // Tự động load dữ liệu khi vào màn hình
  });

  btnBackMain.addEventListener("click", () => {
    viewCursor.classList.remove("active");
    viewMain.classList.add("active");
    modalTitle.innerText = "Settings";
  });
}
