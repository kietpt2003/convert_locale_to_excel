// ================= TAB =================
export function switchTab(index) {
  const tabs = document.querySelectorAll(".tab");
  const contents = document.querySelectorAll(".tab-content");

  tabs.forEach((t, i) => {
    t.classList.toggle("active", i === index);
    contents[i].classList.toggle("active", i === index);
  });
}

// ================= DEV MODE =================
export function switchDevMode(mode) {
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

// ================= ANIMATION =================
export function animateCount(element, to) {
  element.style.transform = "scale(1.2)";

  const duration = 1000;
  const startTime = performance.now();

  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  function update(currentTime) {
    const progress = easeOut(
      Math.min((currentTime - startTime) / duration, 1)
    );

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
    const res = await fetch("/visits");
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
  const nameWithoutExt = file.name.substring(
    0,
    file.name.lastIndexOf(".")
  );

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
        const resToken = await fetch("/blob-token");
        const dataToken = await resToken.json();

        const url = await uploadFile(file, dataToken.token);

        button.textContent = "Processing...";

        const res = await fetch("/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fileUrl: url }),
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
        const resToken = await fetch("/blob-token");
        const dataToken = await resToken.json();

        const url = await uploadFile(file, dataToken.token);

        button.textContent = "Processing...";

        const res = await fetch("/upload-excel", {
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
  document
    .getElementById("form-cs")
    .addEventListener("submit", async (e) => {
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
        const resToken = await fetch("/blob-token", {
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

        const res = await fetch("/upload-excel-merge-zip", {
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
        button.textContent = "Merge";
      }
    });
}

export async function loadStats() {
  try {
    const endpoints = [
      { key: "total-access", endpoint: "/" },
      { key: "upload-count", endpoint: "/upload" },
      { key: "upload-excel-count", endpoint: "/upload-excel" },
      { key: "merge-count", endpoint: "/upload-excel-merge-zip" },
    ];

    for (const item of endpoints) {
      const res = await fetch(`api-usage/total?endpoint=${item.endpoint}`);
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

  tabDev();

  tabCS();
}