let authToken = localStorage.getItem("app_token");

async function fetchWithAuth(url, options = {}) {
  const headers = {
    ...options.headers,
    Authorization: `Bearer ${authToken}`,
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
  if (authToken) {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("main-app").style.display = "block";

    updateUserInfoUI(); //Update user info to UI

    init();
  } else {
    google.accounts.id.initialize({
      client_id:
        "797919519685-raio24mb9u572jjc26o7mj7bsg8m4vrc.apps.googleusercontent.com",
      callback: handleGoogleLogin,
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

    // Hiển thị thêm chữ (Admin) nếu có quyền
    const roleText = user.role === "admin" ? " (Admin)" : "";
    document.getElementById("user-name").textContent =
      (user.name || "User") + roleText;
    document.getElementById("user-email").textContent = user.email || "";

    // NẾU LÀ ADMIN -> HIỆN TAB QUẢN LÝ VÀ TẢI DANH SÁCH
    if (user.role === "admin") {
      document.getElementById("tab-admin").style.display = "block";
      loadAdminUsers();

      // Gắn sự kiện submit cho form Add User
      const formAdd = document.getElementById("form-add-user");
      // Tránh việc bị gán sự kiện nhiều lần nếu hàm này gọi lại
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

          e.target.reset(); // Xóa input
          loadAdminUsers(); // Tải lại bảng
        } catch (err) {
          alert(`❌ Lỗi: ${err.message}`);
        } finally {
          btn.textContent = "Cấp quyền";
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
  const resultDiv = document.getElementById("result-dev");
  const link = document.getElementById("download-link-dev");

  link.href = "";
  link.textContent = "";
  resultDiv.style.display = "none";

  const formJs = document.getElementById("form-dev-js");
  const formExcel = document.getElementById("form-dev-excel");

  const btnJs = document.getElementById("btn-js");
  const btnExcel = document.getElementById("btn-excel");

  if (mode === "js-to-excel") {
    formJs.style.display = "block";
    formExcel.style.display = "none";

    btnJs.classList.add("active");
    btnExcel.classList.remove("active");
  } else {
    formJs.style.display = "none";
    formExcel.style.display = "block";

    btnJs.classList.remove("active");
    btnExcel.classList.add("active");
  }
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
  document
    .getElementById("form-dev-js")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();

      const form = e.target;
      const file = form.querySelector('input[name="file"]').files?.[0];

      if (!file) return;

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
          body: JSON.stringify({ fileUrl: url }),
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
        button.textContent = "Convert";
      }
    });

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
      loadAdminUsers(); // Tải lại bảng
    } catch (e) {
      alert(`❌ Lỗi: ${e.message}`);
    }
  };

  tabDev();

  tabCS();
}

async function loadAdminUsers() {
  try {
    const res = await fetchWithAuth("/admin/users");
    if (!res.ok) return;
    const users = await res.json();

    const tbody = document.getElementById("user-list-tbody");
    let html = "";

    users.forEach((u) => {
      // Đổi màu badge quyền
      const roleBadge =
        u.role === "admin"
          ? `<span style="background: #ffebee; color: #c62828; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">ADMIN</span>`
          : `<span style="background: #e3f2fd; color: #1565c0; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">USER</span>`;

      html += `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #eee;">${u.email}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eee;">${roleBadge}</td>
          <td style="padding: 12px; border-bottom: 1px solid #eee;">
            <button onclick="deleteAdminUser('${u.email}')" style="background: #ef4444; padding: 6px 12px; font-size: 12px;">Xóa</button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  } catch (e) {
    console.error("Load users failed", e);
  }
}
