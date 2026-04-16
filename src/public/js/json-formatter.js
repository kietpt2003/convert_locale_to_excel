const inputArea = document.getElementById("json-input");
const outputArea = document.getElementById("json-output");
const formatBtn = document.getElementById("btn-format");
const minifyBtn = document.getElementById("btn-minify");
const tsGenBtn = document.getElementById("btn-ts-gen");
const clearBtn = document.getElementById("btn-clear");
const copyBtn = document.getElementById("btn-copy-json");
const statusBox = document.getElementById("status-box");
const themeToggleBtn = document.getElementById("btn-theme-toggle");

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
    outputArea.value = JSON.stringify(obj, null, 4); // Format lùi 4 spaces
    showStatus("✅ Format JSON thành công!", "success");
  }
});

minifyBtn.addEventListener("click", () => {
  const obj = parseInput();
  if (obj) {
    outputArea.value = JSON.stringify(obj); // Ép thành 1 dòng
    showStatus("✅ Minify JSON thành công!", "success");
  }
});

copyBtn.addEventListener("click", () => {
  if (!outputArea.value) return;
  navigator.clipboard.writeText(outputArea.value).then(() => {
    const originalText = copyBtn.innerHTML;
    copyBtn.innerHTML = "Copied!";
    copyBtn.style.backgroundColor = "#4ade80";
    copyBtn.style.color = "#fff";
    setTimeout(() => {
      copyBtn.innerHTML = originalText;
      copyBtn.style.backgroundColor = "";
      copyBtn.style.color = "";
    }, 2000);
  });
});

// ==========================================
// TÍNH NĂNG VÀNG: JSON TO TYPESCRIPT
// ==========================================
tsGenBtn.addEventListener("click", () => {
  const obj = parseInput();
  if (!obj) return;

  let tsInterfaces = "";
  const interfaceNames = new Set();

  // Đệ quy phân tích type
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

  // Khởi động với tên Root
  getType(obj, "RootObject");

  outputArea.value = tsInterfaces.trim();
  showStatus("🪄 Đã hô biến JSON thành TypeScript Interfaces!", "success");
});

// ==========================================
// TÍNH NĂNG CHUYỂN ĐỔI THEME (LIGHT / DARK)
// ==========================================
let isDarkMode = false; // Mặc định là Light Mode

themeToggleBtn.addEventListener("click", () => {
  isDarkMode = !isDarkMode; // Đảo trạng thái

  if (isDarkMode) {
    // Bật Dark Mode
    outputArea.classList.add("dark-mode");
    // Đổi Icon sang Mặt trời (Light Theme)
    themeToggleBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
      Light Theme
    `;
  } else {
    // Trở về Light Mode
    outputArea.classList.remove("dark-mode");
    // Đổi Icon sang Mặt trăng (Dark Theme)
    themeToggleBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
      Dark Theme
    `;
  }
});
