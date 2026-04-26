const inputArea = document.getElementById("json-input");
const outputArea = document.getElementById("json-output");
const formatBtn = document.getElementById("btn-format");
const minifyBtn = document.getElementById("btn-minify");
const tsGenBtn = document.getElementById("btn-ts-gen");
const clearBtn = document.getElementById("btn-clear");
const copyBtn = document.getElementById("btn-copy-json");
const statusBox = document.getElementById("status-box");
const themeToggleBtn = document.getElementById("btn-theme-toggle");
const searchInput = document.getElementById("search-input");
const searchCount = document.getElementById("search-count");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const searchBar = document.getElementById("search-bar");

let searchMatches = [];
let currentMatchIndex = -1;
let searchTimeout = null;
let currentRawJson = "";

// --- HÀM BỔ TRỢ ---
function showStatus(message, type) {
  statusBox.innerText = message;
  statusBox.style.display = "block";
  statusBox.className = "status-box"; // Reset class
  if (type === "success") {
    statusBox.classList.add("status-success");
  } else {
    statusBox.classList.add("status-error");
  }
}

function parseInput() {
  const raw = inputArea.value.trim();
  if (!raw) {
    showStatus("⚠️ Vui lòng nhập JSON vào ô bên trái.", "error");
    return null;
  }
  try {
    const obj = JSON.parse(raw);
    statusBox.style.display = "none";
    return obj;
  } catch (err) {
    showStatus(`❌ Lỗi Cú Pháp JSON:\n${err.message}`, "error");
    outputArea.value = "";
    return null;
  }
}

function renderJSON(val, key = null) {
  const container = document.createElement("div");
  container.className = "json-node";

  let content = document.createElement("span");
  const isObject = val !== null && typeof val === "object";

  // Tạo phần key
  if (key) {
    const keySpan = document.createElement("span");
    keySpan.className = "json-key";
    keySpan.innerText = `"${key}": `;
    container.appendChild(keySpan);
  }

  if (isObject) {
    const isArray = Array.isArray(val);
    const openBrace = isArray ? "[" : "{";
    const closeBrace = isArray ? "]" : "}";

    const toggle = document.createElement("span");
    toggle.className = "toggle-btn";
    toggle.innerText = "▼";
    toggle.onclick = (e) => {
      const parent = e.target.parentElement;
      parent.classList.toggle("collapsed");
      toggle.innerText = parent.classList.contains("collapsed") ? "▶" : "▼";
    };
    container.prepend(toggle);

    container.append(openBrace);

    const contentDiv = document.createElement("div");
    contentDiv.className = "json-content";
    contentDiv.style.paddingLeft = "20px";

    const keys = Object.keys(val);
    keys.forEach((k, index) => {
      const child = renderJSON(val[k], isArray ? null : k);

      // NẾU KHÔNG PHẢI LÀ PHẦN TỬ CUỐI CÙNG -> Thêm dấu phẩy
      if (index < keys.length - 1) {
        const comma = document.createElement("span");
        comma.className = "json-comma"; // Thêm class để CSS dễ quản lý nếu cần
        comma.innerText = ",";
        child.appendChild(comma); // Gắn dấu phẩy vào CUỐI của child
      }

      contentDiv.appendChild(child);
    });

    container.appendChild(contentDiv);

    const ellipsis = document.createElement("span");
    ellipsis.className = "json-ellipsis";
    ellipsis.innerText = " ... ";
    container.appendChild(ellipsis);

    container.append(closeBrace);
  } else {
    // Render giá trị thường
    const valSpan = document.createElement("span");
    if (typeof val === "string") {
      valSpan.className = "json-string";
      valSpan.innerText = `"${val}"`;
    } else if (typeof val === "number") {
      valSpan.className = "json-number";
      valSpan.innerText = val;
    } else {
      valSpan.className = "json-boolean";
      valSpan.innerText = val;
    }
    container.appendChild(valSpan);
  }
  return container;
}

// --- LOGIC TÌM KIẾM (SEARCH) ---
function performSearch() {
  const term = searchInput.value.toLowerCase();

  // 1. Xóa sạch highlight cũ (Dùng cách này nhanh hơn thay thế từng node)
  const highlights = outputArea.querySelectorAll(".search-highlight");
  highlights.forEach((span) => {
    const parent = span.parentNode;
    parent.replaceChild(document.createTextNode(span.innerText), span);
    parent.normalize();
  });

  if (!term || term.length < 2) {
    // Chỉ search khi từ khóa >= 2 ký tự
    searchMatches = [];
    currentMatchIndex = -1;
    searchCount.innerText = "0/0";
    return;
  }

  // 2. Tìm kiếm và Highlight
  searchMatches = [];
  // Quét qua các span chứa nội dung giá trị để highlight (nhanh hơn quét toàn bộ tree)
  const targets = outputArea.querySelectorAll(
    ".json-string, .json-key, .json-number, .json-boolean",
  );

  targets.forEach((node) => {
    const text = node.innerText;
    if (text.toLowerCase().includes(term)) {
      const regex = new RegExp(`(${term})`, "gi");
      node.innerHTML = text.replace(
        regex,
        '<span class="search-highlight">$1</span>',
      );

      // Đẩy các thẻ span vừa tạo vào danh sách matches
      node
        .querySelectorAll(".search-highlight")
        .forEach((h) => searchMatches.push(h));
    }
  });

  currentMatchIndex = searchMatches.length > 0 ? 0 : -1;
  updateSearchUI();
}

function updateSearchUI() {
  // Xóa class 'current' cũ
  outputArea
    .querySelectorAll(".search-highlight.current")
    .forEach((el) => el.classList.remove("current"));

  if (currentMatchIndex >= 0 && searchMatches[currentMatchIndex]) {
    const activeMatch = searchMatches[currentMatchIndex];
    activeMatch.classList.add("current");

    // Tự động mở rộng các node cha nếu chúng đang bị đóng (collapsed)
    let parent = activeMatch.parentElement;
    while (parent && parent !== outputArea) {
      if (parent.classList.contains("collapsed")) {
        parent.classList.remove("collapsed");
        const btn = parent.querySelector(".toggle-btn");
        if (btn) btn.innerText = "▼";
      }
      parent = parent.parentElement;
    }

    activeMatch.scrollIntoView({ behavior: "smooth", block: "center" });
    searchCount.innerText = `${currentMatchIndex + 1}/${searchMatches.length}`;
  } else {
    searchCount.innerText = `0/${searchMatches.length}`;
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Sự kiện search
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    performSearch();
  }, 300); // Đợi 300ms sau khi ngừng gõ mới search
});
btnNext.addEventListener("click", () => {
  if (searchMatches.length > 0) {
    currentMatchIndex = (currentMatchIndex + 1) % searchMatches.length;
    updateSearchUI();
  }
});
btnPrev.addEventListener("click", () => {
  if (searchMatches.length > 0) {
    currentMatchIndex =
      (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    updateSearchUI();
  }
});

// --- SỰ KIỆN NÚT BẤM ---

clearBtn.addEventListener("click", () => {
  inputArea.value = "";
  outputArea.value = "";
  statusBox.style.display = "none";
  inputArea.focus();
});

formatBtn.addEventListener("click", () => {
  const obj = parseInput();
  if (obj) {
    currentRawJson = JSON.stringify(obj, null, 4);
    outputArea.innerHTML = "";
    outputArea.appendChild(renderJSON(obj));
    searchBar.style.display = "flex";
    showStatus("✅ Render JSON thành công!", "success");
  }
});

minifyBtn.addEventListener("click", () => {
  const obj = parseInput();
  if (obj) {
    currentRawJson = JSON.stringify(obj);

    outputArea.innerHTML = `
      <div class="minify-view" style="white-space: normal; word-break: break-all; line-height: 1.6;">
        <span class="json-string">${escapeHtml(currentRawJson)}</span>
      </div>
    `;

    searchBar.style.display = "flex";
    showStatus("✅ Đã nén JSON thành 1 dòng!", "success");
  }
});

copyBtn.addEventListener("click", () => {
  if (!currentRawJson) {
    showStatus("⚠️ Không có dữ liệu để copy!", "error");
    return;
  }

  navigator.clipboard
    .writeText(currentRawJson)
    .then(() => {
      const originalContent = copyBtn.innerHTML;

      copyBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      Copied!
    `;
      copyBtn.style.backgroundColor = "#22c55e";
      copyBtn.style.color = "white";
      copyBtn.style.borderColor = "#16a34a";

      setTimeout(() => {
        copyBtn.innerHTML = originalContent;
        copyBtn.style.backgroundColor = "";
        copyBtn.style.color = "";
        copyBtn.style.borderColor = "";
      }, 2000);

      showStatus("📋 Đã copy JSON sạch vào bộ nhớ tạm!", "success");
    })
    .catch((err) => {
      showStatus("❌ Lỗi khi copy: " + err, "error");
    });
});

tsGenBtn.addEventListener("click", () => {
  const obj = parseInput();
  if (!obj) return;

  let tsInterfaces = "";
  const interfaceNames = new Set();

  function getType(value, keyName) {
    if (value === null) return "any";
    const type = typeof value;

    if (type === "string" || type === "number" || type === "boolean") {
      return type;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return "any[]";
      const firstItemType = getType(value[0], keyName + "Item");
      return `${firstItemType}[]`;
    }

    if (type === "object") {
      // Đặt tên Interface theo key (chữ cái đầu viết hoa)
      const interfaceName = keyName.charAt(0).toUpperCase() + keyName.slice(1);

      // Đảm bảo không trùng tên interface
      let finalName = interfaceName;
      let counter = 1;
      while (interfaceNames.has(finalName)) {
        finalName = interfaceName + counter;
        counter++;
      }
      interfaceNames.add(finalName);

      // Tạo body cho interface
      let fields = "";
      for (const [k, v] of Object.entries(value)) {
        const fieldType = getType(v, k);
        // Kiểm tra xem key có chứa ký tự đặc biệt không (dấu gạch ngang, khoảng trắng...)
        const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : `'${k}'`;
        fields += `  ${safeKey}: ${fieldType};\n`;
      }

      const interfaceCode = `export interface ${finalName} {\n${fields}}\n\n`;
      tsInterfaces = interfaceCode + tsInterfaces; // Đẩy interface con lên đầu
      return finalName;
    }
    return "any";
  }

  getType(obj, "RootObject");

  outputArea.value = tsInterfaces.trim();
  showStatus("🪄 Đã hô biến JSON thành TypeScript Interfaces!", "success");
});

let isDarkMode = false;

themeToggleBtn.addEventListener("click", () => {
  isDarkMode = !isDarkMode;

  if (isDarkMode) {
    outputArea.classList.add("dark-mode");
    themeToggleBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
      Light Theme
    `;
  } else {
    outputArea.classList.remove("dark-mode");
    themeToggleBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
      Dark Theme
    `;
  }
});
