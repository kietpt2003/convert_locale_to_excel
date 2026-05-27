let fakeCursorDiv = null;

function applyGlobalAnimatedCursor(
  defaultGifUrl,
  pointerPngUrl,
  width = "32px",
  height = "32px",
  transform = "translate(0, 0)",
) {
  // 1. Giấu con trỏ thật của trình duyệt bằng CSS
  let cursorStyle = document.getElementById("global-custom-cursor-style");
  if (!cursorStyle) {
    cursorStyle = document.createElement("style");
    cursorStyle.id = "global-custom-cursor-style";
    document.head.appendChild(cursorStyle);
  }
  // Ép ẩn chuột thật trên mọi mặt trận
  cursorStyle.innerHTML = `* { cursor: none !important; }`;

  // 2. Tạo con chuột giả (Thẻ div)
  if (!fakeCursorDiv) {
    fakeCursorDiv = document.createElement("div");
    fakeCursorDiv.id = "global-fake-cursor";

    // Style cho chuột giả
    Object.assign(fakeCursorDiv.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: width, // Chỉnh kích thước chuột tại đây
      height: height,
      pointerEvents: "none", // BẮT BUỘC: Để click xuyên qua được ảnh
      zIndex: "999999",
      backgroundSize: "contain",
      backgroundRepeat: "no-repeat",
      transform: transform, // Nếu tâm ảnh ở giữa thì đổi thành translate(-50%, -50%)
      transition: "background-image 0.1s ease", // Hiệu ứng chuyển mượt khi biến hình
    });

    document.body.appendChild(fakeCursorDiv);

    // 3. Cho chuột giả chạy theo chuột thật
    window.addEventListener("mousemove", (e) => {
      fakeCursorDiv.style.left = `${e.clientX}px`;
      fakeCursorDiv.style.top = `${e.clientY}px`;
    });
  }

  // Set ảnh mặc định ban đầu (Ảnh động GIF)
  fakeCursorDiv.style.backgroundImage = `url('${defaultGifUrl}')`;

  // 4. Lắng nghe sự kiện rê chuột (Hover) để biến hình
  // Danh sách các selector cần đổi sang chuột pointer
  const pointerSelectors =
    'a, a *, button, button *, input[type="button"], input[type="submit"], select, select *, [role="button"], .cursor-pointer, .tab, .tab *, .st-floating-btn, .chat-bubble-btn, #agent-widget, .chat-close-icon, .user-item, .guide-tab-item, .guide-step-img, .guide-img-full-close, .explorer-item, .project-name, .log-time-trigger, .close-modal';

  document.body.addEventListener("mouseover", (e) => {
    // Nếu chuột chạm vào các phần tử có tính tương tác
    if (e.target.closest(pointerSelectors)) {
      fakeCursorDiv.style.backgroundImage = `url('${pointerPngUrl}')`;
    }
  });

  document.body.addEventListener("mouseout", (e) => {
    // Nếu chuột rời khỏi các phần tử tương tác
    if (e.target.closest(pointerSelectors)) {
      fakeCursorDiv.style.backgroundImage = `url('${defaultGifUrl}')`;
    }
  });
}

const CURSOR_PACKS = {
  system: {
    default: "../assets/mouse/LizardMemeCursors.png",
    pointer: "../assets/mouse/LizardMemePointer.png",
    width: "31px",
    height: "31px",
  },
  lizardmeme: {
    default: "../assets/mouse/LizardMemeCursors.png",
    pointer: "../assets/mouse/LizardMemePointer.png",
    width: "48px",
    height: "48px",
    transform: "translate(-50%, -50%)",
  },
  catknife: {
    default: "../assets/mouse/catKnifeCursors.png",
    pointer: "../assets/mouse/catKnifePointer.png",
    width: "52px",
    height: "52px",
  },
  cathand: {
    default: "../assets/mouse/catHandCursors.png",
    pointer: "../assets/mouse/catHandPointer.png",
    width: "42px",
    height: "42px",
  },
  catshark: {
    default: "../assets/mouse/catSharkCursors.png",
    pointer: "../assets/mouse/catSharkPointer.png",
    width: "58px",
    height: "58px",
  },
  kawaiicat: {
    default: "../assets/mouse/kawaiiCatCursors.png",
    pointer: "../assets/mouse/kawaiiCatPointer.png",
    width: "48px",
    height: "48px",
  },
  hellokitty: {
    default: "../assets/mouse/HelloKittyCursors.png",
    pointer: "../assets/mouse/HelloKittyPointer.png",
    width: "32px",
    height: "32px",
  },
};

// ==========================================
// CÁC HÀM ĐIỀU KHIỂN
// ==========================================
function setCursorPack(packId) {
  // Nếu user chọn mặc định hoặc ID không tồn tại trong kho -> Reset
  if (packId === "system" || !CURSOR_PACKS[packId]) {
    resetToDefaultCursor();
    return;
  }

  // Lấy data từ kho ra và apply
  const pack = CURSOR_PACKS[packId];
  applyGlobalAnimatedCursor(
    pack.default,
    pack.pointer,
    pack.width,
    pack.height,
    pack.transform,
  );

  // Lưu vào bộ nhớ để F5 không bị mất
  localStorage.setItem("saved_cursor", packId);
}

function resetToDefaultCursor() {
  const cursorStyle = document.getElementById("global-custom-cursor-style");
  if (cursorStyle) cursorStyle.remove();

  if (fakeCursorDiv) {
    fakeCursorDiv.remove();
    fakeCursorDiv = null;
  }

  localStorage.removeItem("saved_cursor");
}

// AUTO-LOAD KHI F5 HOẶC CHUYỂN TRANG
window.addEventListener("DOMContentLoaded", () => {
  const savedPack = localStorage.getItem("saved_cursor");

  if (savedPack && CURSOR_PACKS[savedPack]) {
    setCursorPack(savedPack);
  } else {
    setCursorPack("amongus");
  }
});
