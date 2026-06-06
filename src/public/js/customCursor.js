let fakeCursorDiv = null;

function applyGlobalAnimatedCursor(
  defaultGifUrl,
  pointerPngUrl,
  width = "32px",
  height = "32px",
  transform = "translate(0, 0)",
) {
  let cursorStyle = document.getElementById("global-custom-cursor-style");
  if (!cursorStyle) {
    cursorStyle = document.createElement("style");
    cursorStyle.id = "global-custom-cursor-style";
    document.head.appendChild(cursorStyle);
  }
  cursorStyle.innerHTML = `* { cursor: none !important; }`;

  if (!fakeCursorDiv) {
    fakeCursorDiv = document.createElement("div");
    fakeCursorDiv.id = "global-fake-cursor";

    Object.assign(fakeCursorDiv.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: width,
      height: height,
      pointerEvents: "none",
      zIndex: "999999",
      backgroundSize: "contain",
      backgroundRepeat: "no-repeat",
      transform: transform,
      transition: "background-image 0.1s ease",
    });

    document.body.appendChild(fakeCursorDiv);

    window.addEventListener("mousemove", (e) => {
      fakeCursorDiv.style.left = `${e.clientX}px`;
      fakeCursorDiv.style.top = `${e.clientY}px`;
    });
  }

  fakeCursorDiv.style.backgroundImage = `url('${defaultGifUrl}')`;

  const pointerSelectors =
    'a, a *, button, button *, input[type="button"], input[type="submit"], select, select *, [role="button"], .cursor-pointer, .tab, .tab *, .st-floating-btn, .chat-bubble-btn, #agent-widget, .chat-close-icon, .user-item, .guide-tab-item, .guide-step-img, .guide-img-full-close, .explorer-item, .project-name, .log-time-trigger, .close-modal';

  // Chống lỗi trùng lặp EventListener bằng cách dùng biến cờ (flag)
  if (!window.hasCursorHoverEvent) {
    document.body.addEventListener("mouseover", (e) => {
      if (e.target.closest(pointerSelectors) && fakeCursorDiv) {
        fakeCursorDiv.style.backgroundImage = `url('${window.currentPointerUrl}')`;
      }
    });

    document.body.addEventListener("mouseout", (e) => {
      if (e.target.closest(pointerSelectors) && fakeCursorDiv) {
        fakeCursorDiv.style.backgroundImage = `url('${window.currentDefaultUrl}')`;
      }
    });
    window.hasCursorHoverEvent = true;
  }

  // Lưu URL hiện tại để EventListener ở trên dùng
  window.currentDefaultUrl = defaultGifUrl;
  window.currentPointerUrl = pointerPngUrl;
}

// 👉 ĐÃ THÊM NAME VÀ CATEGORY VÀO KHO DỮ LIỆU
const CURSOR_PACKS = {
  system: {
    name: "System Default",
    category: "Basic",
    default: "../assets/mouse/defaultCursors.png",
    pointer: "../assets/mouse/defaultPointer.png",
    width: "48px",
    height: "48px",
  },
  lizardmeme: {
    name: "Lizard Meme",
    category: "Meme",
    default: "../assets/mouse/LizardMemeCursors.png",
    pointer: "../assets/mouse/LizardMemePointer.png",
    width: "48px",
    height: "48px",
    transform: "translate(-50%, -50%)",
  },
  jerrymousememe: {
    name: "Jerry Mouse Meme",
    category: "Meme",
    default: "../assets/mouse/JerryMouseCursors.png",
    pointer: "../assets/mouse/JerryMousePointer.png",
    width: "48px",
    height: "48px",
  },
  runningawaybaloon: {
    name: "Running Away Baloon Meme",
    category: "Meme",
    default: "../assets/mouse/RunningAwayBaloonCursors.png",
    pointer: "../assets/mouse/RunningAwayBaloonPointer.png",
    width: "48px",
    height: "48px",
  },
  cookeddog: {
    name: "Cooked Dog Meme",
    category: "Meme",
    default: "../assets/mouse/CookedDogCursors.png",
    pointer: "../assets/mouse/CookedDogPointer.png",
    width: "48px",
    height: "48px",
  },
  catknife: {
    name: "Cat Knife",
    category: "Animals",
    default: "../assets/mouse/catKnifeCursors.png",
    pointer: "../assets/mouse/catKnifePointer.png",
    width: "58px",
    height: "58px",
  },
  cathand: {
    name: "Cat Hand",
    category: "Animals",
    default: "../assets/mouse/catHandCursors.png",
    pointer: "../assets/mouse/catHandPointer.png",
    width: "42px",
    height: "42px",
  },
  catshark: {
    name: "Cat Shark",
    category: "Animals",
    default: "../assets/mouse/CatSharkCursors.png",
    pointer: "../assets/mouse/CatSharkPointer.png",
    width: "58px",
    height: "58px",
  },
  kawaiicat: {
    name: "Kawaii Cat",
    category: "Animals",
    default: "../assets/mouse/KawaiiCatCursors.png",
    pointer: "../assets/mouse/KawaiiCatPointer.png",
    width: "48px",
    height: "48px",
  },
  swimmingcorgi: {
    name: "Swimming Corgi",
    category: "Animals",
    default: "../assets/mouse/SwimmingCorgi.png",
    pointer: "../assets/mouse/SwimmingCorgi.png",
    width: "48px",
    height: "48px",
  },
  slappingcat: {
    name: "Slapping Cat",
    category: "Animals",
    default: "../assets/mouse/SlappingCat.png",
    pointer: "../assets/mouse/SlappingCat.png",
    width: "48px",
    height: "48px",
  },
  narutofacechibi: {
    name: "Naruto Face Chibi",
    category: "Anime",
    default: "../assets/mouse/NarutoChibiFaceCursors.png",
    pointer: "../assets/mouse/NarutoChibiFacePointer.png",
    width: "42px",
    height: "42px",
  },
  luffy: {
    name: "Luffy Face",
    category: "Anime",
    default: "../assets/mouse/LuffyFaceCursors.png",
    pointer: "../assets/mouse/LuffyFacePointer.png",
    width: "42px",
    height: "42px",
  },
  sabo: {
    name: "Sanrio Tuxedo Sam x Sabo Crossover",
    category: "Anime",
    default: "../assets/mouse/SaboCursors.png",
    pointer: "../assets/mouse/SaboPointer.png",
    width: "42px",
    height: "42px",
  },
  nezukochibi: {
    name: "Nezuko Chibi",
    category: "Anime",
    default: "../assets/mouse/NezukoChibiCursors.png",
    pointer: "../assets/mouse/NezukoChibiPointer.png",
    width: "42px",
    height: "42px",
  },
  satoruchibi: {
    name: "Satoru Gojo Chibi",
    category: "Anime",
    default: "../assets/mouse/SatoruGojoChibiCursors.png",
    pointer: "../assets/mouse/SatoruGojoChibiPointer.png",
    width: "42px",
    height: "42px",
  },
  finnface: {
    name: "Adventure Time Chibi Finn the Human Face",
    category: "Cute",
    default: "../assets/mouse/FinnChibiFaceCursors.png",
    pointer: "../assets/mouse/FinnChibiFacePointer.png",
    width: "42px",
    height: "42px",
  },
  hellokitty: {
    name: "Hello Kitty",
    category: "Cute",
    default: "../assets/mouse/HelloKittyCursors.png",
    pointer: "../assets/mouse/HelloKittyPointer.png",
    width: "32px",
    height: "32px",
  },
  kawaiihellokitty: {
    name: "Kawaii Hello Kitty",
    category: "Cute",
    default: "../assets/mouse/KawaiiHelloKittyCursors.png",
    pointer: "../assets/mouse/KawaiiHelloKittyPointer.png",
    width: "32px",
    height: "32px",
  },
  cinnamoroll: {
    name: "Cinnamoroll",
    category: "Cute",
    default: "../assets/mouse/CinnamorollCursors.png",
    pointer: "../assets/mouse/CinnamorollPointer.png",
    width: "32px",
    height: "32px",
  },
  ashface: {
    name: "Ash Face",
    category: "Pokemon",
    default: "../assets/mouse/AshFaceCursors.png",
    pointer: "../assets/mouse/AshFacePointer.png",
    width: "32px",
    height: "32px",
  },
  pikachu: {
    name: "Pikachu",
    category: "Pokemon",
    default: "../assets/mouse/PikachuCursors.png",
    pointer: "../assets/mouse/PikachuPointer.png",
    width: "32px",
    height: "32px",
  },
  eevee: {
    name: "Eevee",
    category: "Pokemon",
    default: "../assets/mouse/EeveeCursors.png",
    pointer: "../assets/mouse/EeveePointer.png",
    width: "42px",
    height: "42px",
  },
  roselia: {
    name: "Roselia",
    category: "Pokemon",
    default: "../assets/mouse/RoseliaCursors.png",
    pointer: "../assets/mouse/RoseliaPointer.png",
    width: "32px",
    height: "32px",
  },
};

// 👉 XUẤT BIẾN RA WINDOW CHO SETTINGS ĐỌC
window.CURSOR_PACKS = CURSOR_PACKS;
window.setCursorPack = setCursorPack;

function setCursorPack(packId) {
  if (packId === "system" || !CURSOR_PACKS[packId]) {
    resetToDefaultCursor();
    localStorage.setItem("saved_cursor", "system");
    return;
  }

  const pack = CURSOR_PACKS[packId];
  applyGlobalAnimatedCursor(
    pack.default,
    pack.pointer,
    pack.width,
    pack.height,
    pack.transform,
  );
  localStorage.setItem("saved_cursor", packId);
}

export function resetToDefaultCursor() {
  const cursorStyle = document.getElementById("global-custom-cursor-style");
  if (cursorStyle) cursorStyle.remove();

  if (fakeCursorDiv) {
    fakeCursorDiv.remove();
    fakeCursorDiv = null;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const savedPack = localStorage.getItem("saved_cursor");
  if (savedPack && CURSOR_PACKS[savedPack]) {
    setCursorPack(savedPack);
  } else {
    setCursorPack("kawaiicat"); // Set mặc định theo ý bạn
  }
});
