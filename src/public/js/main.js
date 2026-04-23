import { initChatAgent } from "./chat-agent.js";

let authToken = localStorage.getItem("app_token");

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
  // --- Get TOKEN receive from BACKEND redirect ---
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const urlToken = hashParams.get("token");
  const urlError = hashParams.get("error");

  if (urlError) {
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
    console.log("check", window.location.origin + "/api/auth/google");
    google.accounts.id.initialize({
      client_id:
        "797919519685-raio24mb9u572jjc26o7mj7bsg8m4vrc.apps.googleusercontent.com",
      // Redirect to signin Google
      ux_mode: "redirect",
      // Endpoint Backend for google redirect
      login_uri: window.location.origin + "/api/auth/google",
    });

    google.accounts.id.renderButton(
      document.getElementById("googleButtonDiv"),
      { theme: "outline", size: "large" },
    );
  }
}

async function handleGoogleLogin(response) {
  try {
    const res = await fetch("/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: response.credential }),
    });

    if (res.ok) {
      const data = await res.json();
      authToken = data.token;
      localStorage.setItem("app_token", authToken);

      document.getElementById("login-screen").style.display = "none";
      document.getElementById("main-app").style.display = "block";

      updateUserInfoUI();

      init();
    } else {
      alert("Login failed!");
    }
  } catch (error) {
    console.error(error);
  }
}

export function signOut() {
  const confirmLogout = confirm("Are you sure you want to sign out?");
  if (confirmLogout) {
    localStorage.removeItem("app_token");
    window.location.reload();
  }
}

function parseJwt(token) {
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

        btn.textContent = "Đang thêm...";
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
    const res = await fetchWithAuth("/visits");
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

  const newName = `${nameWithoutExt}_${Date.now()}.${ext}`;

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
        const resToken = await fetchWithAuth("/blob-token");
        const dataToken = await resToken.json();

        const url = await uploadFile(file, dataToken.token);

        button.textContent = "Processing...";

        const res = await fetchWithAuth("/upload", {
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
        const resToken = await fetchWithAuth("/blob-token");
        const dataToken = await resToken.json();

        const url = await uploadFile(file, dataToken.token);

        button.textContent = "Processing...";

        const res = await fetchWithAuth("/v2/upload-excel", {
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
        const resToken = await fetchWithAuth("/blob-token");
        const dataToken = await resToken.json();

        // Tải 2 file JS lên Vercel Blob cùng lúc
        const [oldUrl, newUrl] = await Promise.all([
          uploadFile(fileOld, dataToken.token),
          uploadFile(fileNew, dataToken.token),
        ]);

        button.textContent = "Comparing...";

        // Gọi API Diff JS
        const res = await fetchWithAuth("/diff-js", {
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
        const resToken = await fetchWithAuth("/blob-token");
        const dataToken = await resToken.json();

        const fileUrl = await uploadFile(fileOriginal, dataToken.token);
        button.textContent = "Translating...";

        const res = await fetchWithAuth("/translate-js", {
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
      const resToken = await fetchWithAuth("/blob-token", {
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

      const res = await fetchWithAuth("/upload-excel-merge-zip", {
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
      });

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
        const resToken = await fetchWithAuth("/blob-token");
        const dataToken = await resToken.json();

        const fileUrl = await uploadFile(file, dataToken.token);

        button.textContent = "Processing...";

        const res = await fetchWithAuth(
          "/v2/generate-excels-for-each-locales",
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
        const resToken = await fetchWithAuth("/blob-token");
        const dataToken = await resToken.json();

        const [oldUrl, newUrl] = await Promise.all([
          uploadFile(fileOld, dataToken.token),
          uploadFile(fileNew, dataToken.token),
        ]);

        button.textContent = "Comparing...";

        const res = await fetchWithAuth("/diff-excel", {
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
        const resToken = await fetchWithAuth("/blob-token");
        const dataToken = await resToken.json();

        const fileUrl = await uploadFile(fileOriginal, dataToken.token);

        button.textContent = `Translating ${targetLangs.length} languages...`;

        const res = await fetchWithAuth("/translate-excel", {
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
      { key: "upload-count", endpoint: "/upload" },
      { key: "upload-excel-count", endpoint: "/v2/upload-excel" },
      { key: "merge-count", endpoint: "/upload-excel-merge-zip" },
      {
        key: "generate-locales",
        endpoint: "/v2/generate-excels-for-each-locales",
      },
      { key: "diff-js-count", endpoint: "/diff-js" },
      { key: "diff-excel-count", endpoint: "/diff-excel" },
      { key: "translate-excel-count", endpoint: "/translate-excel" },
      { key: "translate-js-count", endpoint: "/translate-js" },
    ];

    for (const item of endpoints) {
      const res = await fetchWithAuth(
        `api-usage/total?endpoint=${item.endpoint}`,
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
