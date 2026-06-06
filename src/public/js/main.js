import { initChatAgent } from "./chat-agent.js";
import { initChatWidget } from "./chatWidget.js";
import { resetToDefaultCursor } from "./customCursor.js";
import { initSettingsWidget } from "./settingsWidget.js";

let authToken = localStorage.getItem("app_token");

export const DEADLINE_DATE = new Date("2026-07-01T00:00:00").getTime();
export const NEW_WEBSITE_URL = "https://my-only-tool.vercel.app";

async function fetchWithAuth(url, options = {}) {
  const currentToken = localStorage.getItem("app_token");
  const headers = {
    ...options.headers,
    Authorization: `Bearer ${currentToken}`,
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem("app_token");
    window.location.reload();
  }

  return response;
}

// ================= AUTHENTICATION =================
export function initAuth() {
  // --- Check Migration Shutdown ---
  const now = Date.now();
  const isShutDown = now >= DEADLINE_DATE;

  if (isShutDown) {
    // Nếu đã qua ngày 01/07/2026: Hiển thị màn hình khóa vĩnh viễn
    resetToDefaultCursor();
    showHardShutdownPopup();
    // Ẩn mọi UI cũ, ngắt luôn luồng chạy để không render nút Google Login
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("main-app").style.display = "none";
    return; // Dừng hoàn toàn ứng dụng tại đây
  } else {
    // Nếu chưa tới hạn: Hiển thị popup cảnh báo
    showMigrationWarningPopup();
  }

  // --- Luồng hoạt động bình thường (Nếu chưa bị shutdown) ---
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const urlToken = hashParams.get("token");
  const urlError = hashParams.get("error");

  if (urlError) {
    localStorage.removeItem("app_token");

    if (urlError === "access_denied") {
      alert("Access Denied. Please contact Admin for IT Support");
    } else {
      alert("Login Failed: " + urlError);
    }
    // Clear URL path
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (urlToken) {
    // Save JWT token
    localStorage.setItem("app_token", urlToken);
    // Clear URL path
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // --- Check already signin ---
  authToken = localStorage.getItem("app_token");

  if (authToken) {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("main-app").style.display = "block";

    updateUserInfoUI(); //Update user info to UI
    init();
  } else {
    google.accounts.id.initialize({
      client_id:
        "797919519685-raio24mb9u572jjc26o7mj7bsg8m4vrc.apps.googleusercontent.com",
      ux_mode: "redirect",
      login_uri: window.location.origin + "/api/auth/google",
    });

    google.accounts.id.renderButton(
      document.getElementById("googleButtonDiv"),
      { theme: "outline", size: "large" },
    );
  }
}

export function showMigrationWarningPopup() {
  if (document.getElementById("migration-warning-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "migration-warning-overlay";

  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(15, 23, 42, 0.6); 
    backdrop-filter: blur(6px);
    z-index: 99999;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    box-sizing: border-box; 
  `;

  const box = document.createElement("div");

  box.style.cssText = `
    background: #ffffff; 
    padding: 40px 32px; 
    border-radius: 24px;
    max-width: 420px; 
    width: 90%;
    text-align: center; 
    box-shadow: 0 20px 40px -10px rgba(0,0,0,0.2);
    animation: warning-scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    box-sizing: border-box; 
  `;

  box.innerHTML = `
    <style>
      @keyframes warning-scaleIn {
        0% { opacity: 0; transform: scale(0.95) translateY(10px); }
        100% { opacity: 1; transform: scale(1) translateY(0); }
      }
      .btn-primary {
        display: flex; align-items: center; justify-content: center; gap: 8px;
        background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
        color: #ffffff !important; 
        text-decoration: none; 
        padding: 12px 24px; 
        border-radius: 12px;
        font-weight: 600; 
        font-size: 15px;
        border: none; cursor: pointer; transition: all 0.2s; width: 100%;
        box-shadow: 0 4px 12px rgba(15, 118, 110, 0.25);
        box-sizing: border-box; 
        margin: 0; 
      }
      .btn-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(15, 118, 110, 0.4);
      }
      .btn-secondary {
        display: block; 
        background: #f1f5f9; 
        color: #475569; 
        border: none;
        padding: 12px 24px; 
        border-radius: 12px; 
        font-weight: 600; 
        font-size: 15px;
        cursor: pointer; 
        transition: all 0.2s; 
        width: 100%; 
        margin: 12px 0 0 0; 
        box-sizing: border-box; 
      }
      .btn-secondary:hover {
        background: #e2e8f0; 
        color: #1e293b;
      }
    </style>

    <div style="display: flex; justify-content: center; margin-bottom: 16px;">
      <lottie-player 
        src="assets/BoredHorseDrinkingCoffee.json" 
        background="transparent" 
        speed="1" 
        style="width: 140px; height: 140px;" 
        loop 
        autoplay>
      </lottie-player>
    </div>
    
    <h2 style="margin: 0 0 12px 0; color: #0f172a; font-size: 22px; font-weight: 800;">
      Platform Outdated Soon
    </h2>
    
    <p style="color: #475569; font-size: 15px; line-height: 1.5; margin-bottom: 28px;">
      This current website will be officially retired and unsupported on <strong>01/07/2026</strong>. We highly encourage you to switch to the new system now to ensure a seamless transition!
    </p>
    
    <div style="display: flex; flex-direction: column; width: 100%; box-sizing: border-box;">
      <a href="${NEW_WEBSITE_URL}" target="_blank" rel="noopener noreferrer" class="btn-primary" id="btn-go-new">
        Switch to the New Platform
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14"></path>
          <path d="m12 5 7 7-7 7"></path>
        </svg>
      </a>
      
      <button class="btn-secondary" id="btn-close-warning">
        Not now, continue to current version
      </button>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  document.getElementById("btn-close-warning").addEventListener("click", () => {
    overlay.remove();
  });

  document.getElementById("btn-go-new").addEventListener("click", () => {
    overlay.remove();
  });
}

export function showHardShutdownPopup() {
  if (document.getElementById("shutdown-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "shutdown-overlay";

  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(15, 23, 42, 0.7); 
    backdrop-filter: blur(8px);
    z-index: 999999;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  `;

  const box = document.createElement("div");

  box.style.cssText = `
    background: #ffffff; 
    padding: 48px 40px; 
    border-radius: 24px;
    max-width: 460px; 
    width: 90%;
    text-align: center; 
    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05);
    animation: modal-scaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  box.innerHTML = `
    <style>
      @keyframes modal-scaleIn {
        0% { opacity: 0; transform: scale(0.95) translateY(15px); }
        100% { opacity: 1; transform: scale(1) translateY(0); }
      }
      .shutdown-btn {
        display: inline-flex; 
        align-items: center; 
        justify-content: center; 
        gap: 8px;
        background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
        color: #ffffff !important;
        text-decoration: none; 
        padding: 14px 32px; 
        border-radius: 12px;
        font-weight: 600; 
        font-size: 16px; 
        box-shadow: 0 4px 14px 0 rgba(37, 99, 235, 0.35);
        transition: all 0.2s ease-in-out;
      }
      .shutdown-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(37, 99, 235, 0.5);
      }
      .shutdown-btn:active {
        transform: translateY(0);
      }
    </style>

    <div style="display: flex; justify-content: center; margin-bottom: 16px;">
      <lottie-player 
        src="assets/UnderMaintenance.json" 
        background="transparent" 
        speed="1" 
        style="width: 140px; height: 140px;" 
        loop 
        autoplay>
      </lottie-player>
    </div>

    <h1 style="margin: 0 0 12px 0; color: #0f172a; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">
      Platform Officially Outdated
    </h1>
    
    <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 32px;">
      This system was officially decommissioned on <strong>01/07/2026</strong> and is no longer accessible. Please migrate to the new platform to continue your workflow without interruption.
    </p>
    
    <a href="${NEW_WEBSITE_URL}" target="_blank" rel="noopener noreferrer" class="shutdown-btn">
      Go to the New Platform
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12h14"></path>
        <path d="m12 5 7 7-7 7"></path>
      </svg>
    </a>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

export function signOut() {
  const confirmLogout = confirm("Are you sure you want to sign out?");
  if (confirmLogout) {
    localStorage.removeItem("app_token");
    window.location.reload();
  }
}

export function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split("")
        .map(function (c) {
          return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join(""),
    );

    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

function updateUserInfoUI() {
  if (!authToken) return;

  const user = parseJwt(authToken);
  if (user) {
    const avatarImg = document.getElementById("user-avatar");
    if (user.picture) {
      avatarImg.src = user.picture;
      avatarImg.style.display = "block";
    }

    const roleText = user.role === "admin" ? " (Admin)" : "";
    document.getElementById("user-name").textContent =
      (user.name || "User") + roleText;
    document.getElementById("user-email").textContent = user.email || "";

    if (user.role === "admin") {
      document.getElementById("tab-admin").style.display = "block";
      loadAdminUsers();

      const formAdd = document.getElementById("form-add-user");
      formAdd.onsubmit = async (e) => {
        e.preventDefault();
        const email = e.target.email.value;
        const role = e.target.role.value;
        const btn = document.getElementById("btn-add-user");

        btn.textContent = "Adding...";
        btn.disabled = true;

        try {
          const res = await fetchWithAuth("/admin/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, role }),
          });
          const data = await res.json();

          if (!res.ok) throw new Error(data.message);

          e.target.reset();
          loadAdminUsers();
        } catch (err) {
          alert(`❌ Lỗi: ${err.message}`);
        } finally {
          btn.textContent = "Give access";
          btn.disabled = false;
        }
      };
    }

    const chatWidget = document.getElementById("chat-bubble-btn");
    if (chatWidget) {
      chatWidget.style.display = "flex";
      initChatWidget(user);
    }
  }
}

// ================= TAB =================
function switchTab(index) {
  const tabs = document.querySelectorAll(".tab");
  const contents = document.querySelectorAll(".tab-content");

  tabs.forEach((t, i) => {
    t.classList.toggle("active", i === index);
    contents[i].classList.toggle("active", i === index);
  });
}

// ================= DEV MODE =================
function switchDevMode(mode) {
  window.switchDevMode = function (mode) {
    const resultDiv = document.getElementById("result-dev");
    const link = document.getElementById("download-link-dev");
    link.href = "";
    link.textContent = "";
    resultDiv.style.display = "none";

    const formJs = document.getElementById("form-dev-js");
    const formExcel = document.getElementById("form-dev-excel");
    const formDiffJs = document.getElementById("form-dev-diff-js");
    const formTransJs = document.getElementById("form-dev-translate-js");

    const btnJs = document.getElementById("btn-js");
    const btnExcel = document.getElementById("btn-excel");
    const btnDiffJs = document.getElementById("btn-diff-js");
    const btnTransJs = document.getElementById("btn-translate-js");

    formJs.style.display = "none";
    formExcel.style.display = "none";
    formDiffJs.style.display = "none";
    formTransJs.style.display = "none";

    btnJs.classList.remove("active");
    btnExcel.classList.remove("active");
    btnDiffJs.classList.remove("active");
    btnTransJs.classList.remove("active");

    if (mode === "js-to-excel") {
      formJs.style.display = "block";
      btnJs.classList.add("active");
    } else if (mode === "excel-to-js") {
      formExcel.style.display = "block";
      btnExcel.classList.add("active");
    } else if (mode === "diff-js") {
      formDiffJs.style.display = "block";
      btnDiffJs.classList.add("active");
    } else if (mode === "translate-js") {
      formTransJs.style.display = "block";
      btnTransJs.classList.add("active");
    }
  };
}

function switchCsTab(index) {
  const tabs = document.querySelectorAll(".cs-tab");
  const contents = document.querySelectorAll(".cs-tab-content");

  tabs.forEach((t, i) => {
    t.classList.toggle("active", i === index);
    contents[i].classList.toggle("active", i === index);
  });
}

// ================= ANIMATION =================
export function animateCount(element, to) {
  element.style.transform = "scale(1.2)";

  const duration = 1000;
  const startTime = performance.now();

  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  function update(currentTime) {
    const progress = easeOut(Math.min((currentTime - startTime) / duration, 1));

    const value = Math.floor(progress * to);
    element.textContent = value;

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.style.transform = "scale(1)";
    }
  }

  requestAnimationFrame(update);
}

// ================= API =================
export async function loadVisits() {
  try {
    const res = await fetchWithAuth("/api/stats/visits");
    const data = await res.json();

    const el = document.getElementById("visit-count");
    animateCount(el, data.totalUnique);
  } catch (err) {
    console.error("Failed to load visits", err);
  }
}

// ================= UPLOAD =================
export async function uploadFile(file, token) {
  const ext = file.name.split(".").pop();
  const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf("."));
  const uniqueStr = Math.random().toString(36).substring(2, 9);

  const newName = `${nameWithoutExt}_${Date.now()}_${uniqueStr}.${ext}`;

  const { put } = await import("https://esm.sh/@vercel/blob");

  const blob = await put(newName, file, {
    access: "public",
    token,
  });

  return blob.url;
}

function tabDev() {
  // ================= JS -> EXCEL =================
  document
    .getElementById("form-dev-js")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();

      const form = e.target;
      const file = form.querySelector('input[name="file"]').files[0];

      const resultDiv = document.getElementById("result-dev");
      const link = document.getElementById("download-link-dev");
      const loading = document.getElementById("loading-dev");
      const button = document.getElementById("button-dev-js");

      link.href = "";
      link.textContent = "";
      resultDiv.style.display = "none";

      loading.style.display = "block";
      button.disabled = true;
      button.textContent = "Uploading...";

      try {
        const resToken = await fetchWithAuth("/api/convert-key/blob-token");
        const dataToken = await resToken.json();

        const url = await uploadFile(file, dataToken.token);

        button.textContent = "Processing...";

        const res = await fetchWithAuth("/api/convert-key/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileUrl: url,
          }),
        });

        const data = await res.json();

        if (!res.ok)
          throw new Error(data.message || "Failed to convert JS to Excel");

        requestAnimationFrame(() => {
          link.href = data.url;
          link.textContent = "Download Excel File";
          resultDiv.style.display = "block";
        });
        loadStats();
      } catch (err) {
        alert(`❌ Error: ${err.message}`);
        console.error(err);
      } finally {
        loading.style.display = "none";
        button.disabled = false;
        button.textContent = "Convert JS → Excel";
      }
    });

  // ================= EXCEL -> JS =================
  document
    .getElementById("form-dev-excel")
    .addEventListener("submit", async (e) => {
      e.preventDefault();

      const form = e.target;

      const file = form.querySelector('input[name="file"]').files[0];
      const keyColumn = form.keyColumn.value || 1;
      const valueColumn = form.valueColumn.value || 2;

      const resultDiv = document.getElementById("result-dev");
      const link = document.getElementById("download-link-dev");
      const loading = document.getElementById("loading-dev");
      const button = document.getElementById("button-dev-excel");

      link.href = "";
      link.textContent = "";
      resultDiv.style.display = "none";

      loading.style.display = "block";
      button.disabled = true;
      button.textContent = "Uploading...";

      try {
        const resToken = await fetchWithAuth("/api/convert-key/blob-token");
        const dataToken = await resToken.json();

        const url = await uploadFile(file, dataToken.token);

        button.textContent = "Processing...";

        const res = await fetchWithAuth("/api/convert-key/v2/upload-excel", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileUrl: url,
            keyColumn,
            valueColumn,
          }),
        });

        const data = await res.json();

        requestAnimationFrame(() => {
          link.href = data.url;
          link.textContent = data.url;
          resultDiv.style.display = "block";
        });
        loadStats();
      } catch (err) {
        alert("Something went wrong!");
        console.error(err);
      } finally {
        loading.style.display = "none";
        button.disabled = false;
        button.textContent = "Convert Excel → JS";
      }
    });

  // ================= DIFF CHECKER (COMPARE 2 JS FILES) =================
  const formDiffJs = document.getElementById("form-dev-diff-js");
  if (formDiffJs) {
    formDiffJs.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const fileOld = form.querySelector('input[name="fileOld"]').files[0];
      const fileNew = form.querySelector('input[name="fileNew"]').files[0];

      const resultDiv = document.getElementById("result-dev");
      const link = document.getElementById("download-link-dev");
      const loading = document.getElementById("loading-dev");
      const button = document.getElementById("button-dev-diff-js");

      link.href = "";
      link.textContent = "";
      resultDiv.style.display = "none";
      loading.style.display = "block";
      button.disabled = true;
      button.textContent = "Uploading...";

      try {
        const resToken = await fetchWithAuth("/api/convert-key/blob-token");
        const dataToken = await resToken.json();

        // Tải 2 file JS lên Vercel Blob cùng lúc
        const [oldUrl, newUrl] = await Promise.all([
          uploadFile(fileOld, dataToken.token),
          uploadFile(fileNew, dataToken.token),
        ]);

        button.textContent = "Comparing...";

        // Gọi API Diff JS
        const res = await fetchWithAuth("/api/convert-key/diff-js", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldFileUrl: oldUrl, newFileUrl: newUrl }),
        });

        const data = await res.json();
        if (!res.ok)
          throw new Error(data.message || "Failed to compare JS files");

        requestAnimationFrame(() => {
          link.href = data.url;
          link.textContent = "Download Diff Report (Excel)";
          resultDiv.style.display = "block";
        });
        loadStats(); // Cập nhật số liệu trên Dashboard
      } catch (err) {
        alert(`❌ Error: ${err.message}`);
      } finally {
        loading.style.display = "none";
        button.disabled = false;
        button.textContent = "Compare JS Files";
      }
    });
  }

  document
    .getElementById("form-dev-translate-js")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const fileOriginal = form.querySelector('input[name="fileOriginal"]')
        .files[0];

      // Select all checked checkbox
      const checkboxes = form.querySelectorAll(
        'input[name="targetLangs"]:checked',
      );
      const targetLangs = Array.from(checkboxes).map((cb) => cb.value);

      if (targetLangs.length === 0) {
        alert("⚠️ Please select at least one target language.");
        return;
      }

      const resultDiv = document.getElementById("result-dev");
      const link = document.getElementById("download-link-dev");
      const loading = document.getElementById("loading-dev");
      const button = document.getElementById("button-dev-translate-js");

      link.href = "";
      link.textContent = "";
      resultDiv.style.display = "none";
      loading.style.display = "block";
      button.disabled = true;
      button.textContent = "Uploading...";

      try {
        const resToken = await fetchWithAuth("/api/convert-key/blob-token");
        const dataToken = await resToken.json();

        const fileUrl = await uploadFile(fileOriginal, dataToken.token);
        button.textContent = "Translating...";

        const res = await fetchWithAuth("/api/convert-key/translate-js", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileUrl, targetLangs }),
        });

        const data = await res.json();
        if (!res.ok)
          throw new Error(data.message || "Failed to translate JS file");

        requestAnimationFrame(() => {
          link.href = data.url;
          link.textContent = `Download Translated JS (${data.totalTranslated} keys)`;
          resultDiv.style.display = "block";
        });
        loadStats();
      } catch (err) {
        alert(`❌ Error: ${err.message}`);
      } finally {
        loading.style.display = "none";
        button.disabled = false;
        button.textContent = "Translate JS File";
      }
    });
}

function tabCS() {
  document.getElementById("form-cs").addEventListener("submit", async (e) => {
    e.preventDefault();

    const form = e.target;

    const file1 = form.querySelector('input[name="file1"]').files[0];
    const file2 = form.querySelector('input[name="file2"]').files[0];

    const keyColumnFile1 = form.keyColumnFile1.value || 1;
    const valueColumnFile1 = form.valueColumnFile1.value || 2;
    const keyColumnFile2 = form.keyColumnFile2.value || 1;
    const valueColumnFile2 = form.valueColumnFile2.value || 2;

    const resultDiv = document.getElementById("result-cs");
    const link = document.getElementById("download-link-cs");
    const loading = document.getElementById("loading-cs");
    const button = document.getElementById("button-cs");

    link.href = "";
    link.textContent = "";
    resultDiv.style.display = "none";

    loading.style.display = "block";
    button.disabled = true;
    button.textContent = "Uploading...";

    try {
      const resToken = await fetchWithAuth("/api/convert-key/blob-token", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const dataToken = await resToken.json();

      const [url1, url2] = await Promise.all([
        uploadFile(file1, dataToken.token),
        uploadFile(file2, dataToken.token),
      ]);

      button.textContent = "Processing...";

      const res = await fetchWithAuth(
        "/api/convert-key/upload-excel-merge-zip",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            file1Url: url1,
            file2Url: url2,
            keyColumnFile1,
            valueColumnFile1,
            keyColumnFile2,
            valueColumnFile2,
          }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Please try again later");
      }

      requestAnimationFrame(() => {
        link.href = data.url;
        link.textContent = data.url;
        resultDiv.style.display = "block";
      });
      loadStats();
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
      console.error(err);
    } finally {
      loading.style.display = "none";
      button.disabled = false;
      button.textContent = "Merge";
    }
  });

  document
    .getElementById("form-cs-locales")
    .addEventListener("submit", async (e) => {
      e.preventDefault();

      const form = e.target;

      const file = form.querySelector('input[name="file"]').files[0];

      const workSheetKey = form.workSheetKey.value || 1;
      const keyColumn = form.keyColumn.value || 1;
      const workSheetValue = form.workSheetValue.value || 1;

      const rawValueColumns = form.valueColumns.value;

      const resultDiv = document.getElementById("result-cs-locales");
      const link = document.getElementById("download-link-cs-locales");
      const loading = document.getElementById("loading-cs-locales");
      const button = document.getElementById("button-cs-locales");

      if (!file) {
        alert("Please select a file");
        return;
      }

      const isValidNumber = (val) => {
        return !isNaN(val) && Number(val) > 0;
      };

      if (!isValidNumber(workSheetKey)) {
        alert("Worksheet Key must be a number > 0");
        return;
      }

      if (!isValidNumber(keyColumn)) {
        alert("Key Column must be a number > 0");
        return;
      }

      if (!isValidNumber(workSheetValue)) {
        alert("Worksheet Value must be a number > 0");
        return;
      }

      const valueColumns = rawValueColumns.split(",").map((v) => v.trim());

      if (valueColumns.length === 0) {
        alert("Value Columns is required");
        return;
      }

      const invalidColumns = valueColumns.filter(
        (v) => isNaN(v) || Number(v) <= 0,
      );

      if (invalidColumns.length > 0) {
        alert(
          `Invalid valueColumns: ${invalidColumns.join(", ")}. Must be numbers > 0`,
        );
        return;
      }

      // convert to number array AFTER validate
      const parsedValueColumns = valueColumns.map(Number);

      link.href = "";
      link.textContent = "";
      resultDiv.style.display = "none";

      loading.style.display = "block";
      button.disabled = true;
      button.textContent = "Uploading...";

      try {
        const resToken = await fetchWithAuth("/api/convert-key/blob-token");
        const dataToken = await resToken.json();

        const fileUrl = await uploadFile(file, dataToken.token);

        button.textContent = "Processing...";

        const res = await fetchWithAuth(
          "/api/convert-key/v2/generate-excels-for-each-locales",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              fileUrl,
              workSheetKey: Number(workSheetKey),
              keyColumn: Number(keyColumn),
              workSheetValue: Number(workSheetValue),
              valueColumns: parsedValueColumns,
            }),
          },
        );

        const data = await res.json();

        requestAnimationFrame(() => {
          link.href = data.url;
          link.textContent = data.url;
          resultDiv.style.display = "block";
        });

        loadStats();
      } catch (err) {
        alert("Something went wrong!");
        console.error(err);
      } finally {
        loading.style.display = "none";
        button.disabled = false;
        button.textContent = "Generate ZIP";
      }
    });

  document
    .getElementById("form-cs-diff-excel")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const fileOld = form.querySelector('input[name="fileOld"]').files[0];
      const fileNew = form.querySelector('input[name="fileNew"]').files[0];

      const keyColumnOld = form.keyColumnOld.value || 1;
      const valueColumnOld = form.valueColumnOld.value || 2;
      const keyColumnNew = form.keyColumnNew.value || 1;
      const valueColumnNew = form.valueColumnNew.value || 2;

      const resultDiv = document.getElementById("result-cs-diff-excel");
      const link = document.getElementById("download-link-cs-diff-excel");
      const loading = document.getElementById("loading-cs-diff-excel");
      const button = document.getElementById("button-cs-diff-excel");

      link.href = "";
      link.textContent = "";
      resultDiv.style.display = "none";
      loading.style.display = "block";
      button.disabled = true;
      button.textContent = "Uploading...";

      try {
        const resToken = await fetchWithAuth("/api/convert-key/blob-token");
        const dataToken = await resToken.json();

        const [oldUrl, newUrl] = await Promise.all([
          uploadFile(fileOld, dataToken.token),
          uploadFile(fileNew, dataToken.token),
        ]);

        button.textContent = "Comparing...";

        const res = await fetchWithAuth("/api/convert-key/diff-excel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            oldFileUrl: oldUrl,
            newFileUrl: newUrl,
            keyColumnOld,
            valueColumnOld,
            keyColumnNew,
            valueColumnNew,
          }),
        });

        const data = await res.json();
        if (!res.ok)
          throw new Error(data.message || "Failed to compare Excel files");

        requestAnimationFrame(() => {
          link.href = data.url;
          link.textContent = "Download Diff Report";
          resultDiv.style.display = "block";
        });
        loadStats();
      } catch (err) {
        alert(`❌ Error: ${err.message}`);
      } finally {
        loading.style.display = "none";
        button.disabled = false;
        button.textContent = "Check Differences";
      }
    });

  document
    .getElementById("form-cs-translate")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const fileOriginal = form.querySelector('input[name="fileOriginal"]')
        .files[0];

      // Select all checked checkbox
      const checkboxes = form.querySelectorAll(
        'input[name="targetLangs"]:checked',
      );
      const targetLangs = Array.from(checkboxes).map((cb) => cb.value);

      if (targetLangs.length === 0) {
        alert("⚠️ Please select at least one target language.");
        return;
      }

      const keyColumn = form.keyColumn.value || 1;
      const valueColumn = form.valueColumn.value || 2;

      const resultDiv = document.getElementById("result-cs-translate");
      const link = document.getElementById("download-link-cs-translate");
      const loading = document.getElementById("loading-cs-translate");
      const button = document.getElementById("button-cs-translate");

      link.href = "";
      link.textContent = "";
      resultDiv.style.display = "none";
      loading.style.display = "block";
      button.disabled = true;
      button.textContent = "Uploading...";

      try {
        const resToken = await fetchWithAuth("/api/convert-key/blob-token");
        const dataToken = await resToken.json();

        const fileUrl = await uploadFile(fileOriginal, dataToken.token);

        button.textContent = `Translating ${targetLangs.length} languages...`;

        const res = await fetchWithAuth("/api/convert-key/translate-excel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileUrl,
            targetLangs,
            keyColumn,
            valueColumn,
          }),
        });

        const data = await res.json();
        if (!res.ok)
          throw new Error(data.message || "Failed to translate file");

        requestAnimationFrame(() => {
          link.href = data.url;
          link.textContent = `Download Translated File (${data.totalTranslated} keys, ${data.languages.length} languages)`;
          resultDiv.style.display = "block";
        });
        loadStats();
      } catch (err) {
        alert(`❌ Error: ${err.message}`);
      } finally {
        loading.style.display = "none";
        button.disabled = false;
        button.textContent = "Translate Now";
      }
    });
}

export async function loadStats() {
  try {
    const endpoints = [
      { key: "total-access", endpoint: "/" },
      { key: "upload-count", endpoint: "/api/convert-key/upload" },
      {
        key: "upload-excel-count",
        endpoint: "/api/convert-key/v2/upload-excel",
      },
      {
        key: "merge-count",
        endpoint: "/api/convert-key/upload-excel-merge-zip",
      },
      {
        key: "generate-locales",
        endpoint: "/api/convert-key/v2/generate-excels-for-each-locales",
      },
      { key: "diff-js-count", endpoint: "/api/convert-key/diff-js" },
      { key: "diff-excel-count", endpoint: "/api/convert-key/diff-excel" },
      {
        key: "translate-excel-count",
        endpoint: "/api/convert-key/translate-excel",
      },
      { key: "translate-js-count", endpoint: "/api/convert-key/translate-js" },
    ];

    for (const item of endpoints) {
      const res = await fetchWithAuth(
        `api/stats/total-usage?endpoint=${item.endpoint}`,
      );
      const data = await res.json();

      const el = document.getElementById(item.key);
      animateCount(el, data.total || 0);
    }
  } catch (err) {
    console.error("Load stats error", err);
  }
}

// ================= INIT =================
export function init() {
  initSettingsWidget({ bottom: "200px", right: "24px" });
  loadVisits();
  loadStats();

  window.switchTab = switchTab;
  window.switchDevMode = switchDevMode;

  window.switchCsTab = switchCsTab;

  window.signOut = signOut;

  window.deleteAdminUser = async function (email) {
    if (
      !confirm(
        `⚠️ Are you sure you want to revoke login access for the email address: ${email}?`,
      )
    )
      return;

    try {
      const res = await fetchWithAuth(`/admin/users/${email}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message);
      loadAdminUsers();
    } catch (e) {
      alert(`❌ Error: ${e.message}`);
    }
  };

  tabDev();

  tabCS();

  const agentWidget = document.getElementById("agent-widget");
  if (agentWidget) {
    agentWidget.style.display = "block"; // Hiện Widget lên
    initChatAgent(); // Kích hoạt kéo thả và tính năng gửi Chat
  }
}

async function loadAdminUsers() {
  try {
    const res = await fetchWithAuth("/admin/users");
    if (!res.ok) return;
    const users = await res.json();

    const currentUser = parseJwt(authToken);
    const currentUserEmail = currentUser.email;

    const isCurrentUserSuperAdmin = users.some(
      (u) => u.email === currentUserEmail && u.role === "super_admin",
    );

    const tbody = document.getElementById("user-list-tbody");
    let html = "";

    users.forEach((u) => {
      let roleBadge = "";
      if (u.role === "super_admin") {
        roleBadge = `<span style="background: #f3e5f5; color: #7b1fa2; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">SUPER ADMIN</span>`;
      } else if (u.role === "admin") {
        roleBadge = `<span style="background: #ffebee; color: #c62828; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">ADMIN</span>`;
      } else {
        roleBadge = `<span style="background: #e3f2fd; color: #1565c0; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">USER</span>`;
      }

      let showDeleteBtn = true;
      let rejectReason = "";

      if (u.role === "super_admin") {
        showDeleteBtn = false;
      } else if (u.email === currentUserEmail) {
        showDeleteBtn = false;
        rejectReason = "You";
      } else if (!isCurrentUserSuperAdmin && u.role === "admin") {
        showDeleteBtn = false;
      }

      const actionHtml = showDeleteBtn
        ? `<button onclick="deleteAdminUser('${u.email}')" style="background: #ef4444; padding: 6px 12px; font-size: 12px; cursor: pointer;">Delete</button>`
        : `<span style="color: #9ca3af; font-size: 12px; font-style: italic;">${rejectReason || ""}</span>`;

      html += `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #eee;">${u.email}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eee;">${roleBadge}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eee;">${actionHtml}</td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  } catch (e) {
    console.error("Load users failed", e);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const marqueeEl = document.getElementById("dynamic-marquee");
  if (!marqueeEl) return;

  // 1. Bơm toàn bộ CSS (bao gồm hiệu ứng FBI và Layout cách khoảng)
  if (!document.getElementById("fbi-warning-styles")) {
    const styleBlock = document.createElement("style");
    styleBlock.id = "fbi-warning-styles";
    styleBlock.innerHTML = `
      /* Cách xa 2 câu thông báo để không bị dính chùm */
      .marquee-item {
        display: inline-block;
        margin-right: 100vw; /* Đẩy câu tiếp theo ra xa bằng 1 màn hình */
      }

      /* Hiệu ứng đèn cảnh sát */
      @keyframes strobe-light {
        0%, 100% { background-color: #dc2626; color: #ffffff; box-shadow: 0 0 10px #dc2626; }
        50% { background-color: #fef08a; color: #b91c1c; box-shadow: 0 0 15px #fef08a; }
      }
      .fbi-alert-box {
        display: inline-flex; align-items: center; background: #09090b; color: #f8fafc;
        padding: 4px 16px 4px 6px; border-radius: 8px; border: 1px solid #ef4444;
        box-shadow: 0 0 12px rgba(239, 68, 68, 0.6); font-family: 'Courier New', Courier, monospace;
        letter-spacing: 0.5px;
      }
      .fbi-badge {
        animation: strobe-light 0.6s infinite; padding: 4px 10px; border-radius: 4px;
        font-weight: 900; margin-right: 12px; text-transform: uppercase; font-family: sans-serif;
      }
      .fbi-link {
        color: #38bdf8 !important; text-decoration: none; border-bottom: 2px dashed #38bdf8;
        margin: 0 8px; font-weight: 900; transition: all 0.2s; text-transform: uppercase;
      }
      .fbi-link:hover {
        color: #fbbf24 !important; border-bottom-color: #fbbf24; text-shadow: 0 0 8px rgba(251, 191, 36, 0.8);
      }
    `;
    document.head.appendChild(styleBlock);
  }

  // 2. Chèn thẳng 2 câu vào HTML cùng lúc, bọc trong class "marquee-item"
  marqueeEl.innerHTML = `
    <span class="marquee-item fbi-alert-box">
      <span class="fbi-badge">🚨 FBI WARNING</span>
      This platform will be PERMANENTLY RETIRED on <strong style="color: #ef4444; margin: 0 6px; font-size: 16px;">01/07/2026</strong>. 
      You must 
      <a href="${NEW_WEBSITE_URL}" target="_blank" rel="noopener noreferrer" class="fbi-link">
        MIGRATE TO THE NEW SYSTEM
      </a> 
      immediately to ensure uninterrupted workflow!
    </span>

    <span class="marquee-item">
      🚀 If the Key Generator Tool has been valuable to your workflow and
      saved you time, please consider supporting the developer.
      <a href="javascript:void(0)" onclick="openDonationPopup()" style="color: #ffeb3b; text-decoration: underline; font-weight: bold; padding: 0 5px; cursor: pointer;">
        Buy me a Coffee
      </a>
      Your generosity is deeply appreciated! ❤️
    </span>
  `;
});
