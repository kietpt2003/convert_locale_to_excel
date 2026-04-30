import { fetchWithAuth } from "./redmine.js";

let isFiltersLoaded = false;
let globalAvailableFilters = {};

const OP_LABELS = {
  "=": "is",
  "!": "is not",
  "><": "between",
  "*": "any",
  "!*": "none",
  "~": "contains",
  "!~": "doesn't contain",
};

const OP_BY_TYPE = {
  list: ["=", "!", "*", "!*"],
  list_optional: ["=", "!", "*", "!*"],
  date: ["=", "><", "*"],
  date_past: ["=", "><", "*"],
  string: ["~", "=", "!", "*", "!*"],
  text: ["~", "!~", "*", "!*"],
};

export async function initSpentTimeReportTab() {
  if (isFiltersLoaded) return;
  await loadReportFilters();

  document.getElementById("addFilterSelect").addEventListener("change", (e) => {
    const fieldKey = e.target.value;
    if (fieldKey && globalAvailableFilters[fieldKey]) {
      addFilterRow(fieldKey, globalAvailableFilters[fieldKey]);
      e.target.value = "";
    }
  });

  document.getElementById("btnGenerateReport").onclick = handleGenerateReport;

  document.getElementById("btnClearFilters").onclick = () => {
    document.getElementById("activeFiltersContainer").innerHTML = "";
    addDefaultFilters();
    const reportContainer = document.getElementById("reportResultContainer");
    if (reportContainer) {
      reportContainer.style.display = "none";
      document.getElementById("reportResultHead").innerHTML = "";
      document.getElementById("reportResultBody").innerHTML = "";
    }
  };
}

async function loadReportFilters() {
  const btnGenerate = document.getElementById("btnGenerateReport");
  btnGenerate.disabled = true;

  try {
    const res = await fetchWithAuth(`/api/redmine/report-filters`);
    const result = await res.json();

    if (result.success) {
      const { filters, columns, criterias } = result.data;
      globalAvailableFilters = filters || {};

      const addSelect = document.getElementById("addFilterSelect");
      Object.keys(globalAvailableFilters).forEach((key) => {
        const option = new Option(globalAvailableFilters[key].name, key);
        addSelect.add(option);
      });

      const colSelect = document.getElementById("reportColumnsSelect");
      (columns || []).forEach((col) => {
        const option = new Option(col.name, col.id);
        if (col.id === "month") option.selected = true;
        colSelect.add(option);
      });

      const criSelect = document.getElementById("reportCriteriaSelect");
      (criterias || []).forEach((cri) => {
        const option = new Option(cri.name, cri.id);
        if (cri.id === "project") option.selected = true;
        criSelect.add(option);
      });

      isFiltersLoaded = true;

      // 1. Khởi tạo filter (Date & User)
      addDefaultFilters();

      // 2. ĐỢI MỘT CHÚT ĐỂ DOM ỔN ĐỊNH RỒI MỚI GỌI REPORT
      setTimeout(() => {
        handleGenerateReport();
      }, 500);
    }
  } catch (error) {
    alert("Failed to load report filters.");
  } finally {
    btnGenerate.disabled = false;
  }
}

function addFilterRow(
  fieldKey,
  filterConfig,
  defaultOp = null,
  defaultVals = [],
) {
  const container = document.getElementById("activeFiltersContainer");
  if (document.getElementById(`filter_row_${fieldKey}`)) return;

  const row = document.createElement("div");
  row.id = `filter_row_${fieldKey}`;
  row.className = "dynamic-filter-row";
  row.style.cssText =
    "display: flex; align-items: center; gap: 10px; background: white; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 5px;";

  const label = document.createElement("span");
  label.innerText = filterConfig.name;
  label.style.cssText =
    "min-width: 150px; font-weight: 600; font-size: 0.9rem; color: #334155;";

  const opSelect = document.createElement("select");
  opSelect.className = "form-control operator-select";
  opSelect.style.cssText = "width: 130px; margin: 0; padding: 6px;";
  opSelect.dataset.field = fieldKey;

  const availableOps = OP_BY_TYPE[filterConfig.type] || ["=", "!", "*"];
  availableOps.forEach((op) => {
    const opt = new Option(OP_LABELS[op] || op, op);
    if (op === defaultOp) opt.selected = true;
    opSelect.add(opt);
  });

  const valueContainer = document.createElement("div");
  valueContainer.className = "filter-value-container";
  valueContainer.style.cssText = "display: flex; gap: 5px; flex: 1;";

  const renderValueInput = (operator, useDefaults = false) => {
    valueContainer.innerHTML = "";
    if (operator === "*" || operator === "!*") return;

    if (filterConfig.type.includes("list")) {
      if (filterConfig.values && filterConfig.values.length > 0) {
        const valSelect = document.createElement("select");
        valSelect.className = "form-control filter-value";
        valSelect.style.cssText = "margin: 0; padding: 6px;";
        filterConfig.values.forEach((v) =>
          valSelect.add(new Option(v[0], v[1])),
        );
        if (useDefaults && defaultVals.length > 0)
          valSelect.value = defaultVals[0];
        valueContainer.appendChild(valSelect);
      } else if (filterConfig.remote) {
        const valSelect = document.createElement("select");
        valSelect.className = "form-control filter-value";
        valSelect.style.cssText = "margin: 0; padding: 6px;";
        valSelect.disabled = true;
        valSelect.add(new Option("Loading options...", ""));
        valueContainer.appendChild(valSelect);
        fetchWithAuth(
          `/api/redmine/report-filters/remote/${encodeURIComponent(fieldKey)}`,
        )
          .then((res) => res.json())
          .then((result) => {
            valSelect.innerHTML = "";
            if (result.success && result.data.length > 0) {
              result.data.forEach((v) => valSelect.add(new Option(v[0], v[1])));
              if (useDefaults && defaultVals.length > 0)
                valSelect.value = defaultVals[0];
            }
            valSelect.disabled = false;
          });
      }
    } else if (filterConfig.type.includes("date")) {
      const date1 = document.createElement("input");
      date1.type = "date";
      date1.className = "form-control filter-value";
      date1.style.cssText = "margin: 0; padding: 6px;";
      valueContainer.appendChild(date1);
      if (useDefaults && defaultVals.length > 0) date1.value = defaultVals[0];

      if (operator === "><") {
        valueContainer.appendChild(document.createTextNode("-"));
        const date2 = document.createElement("input");
        date2.type = "date";
        date2.className = "form-control filter-value-2";
        date2.style.cssText = "margin: 0; padding: 6px;";
        valueContainer.appendChild(date2);
        if (useDefaults && defaultVals.length > 1) date2.value = defaultVals[1];
      }
    } else {
      const txtInput = document.createElement("input");
      txtInput.type = "text";
      txtInput.className = "form-control filter-value";
      if (useDefaults && defaultVals.length > 0)
        txtInput.value = defaultVals[0];
      valueContainer.appendChild(txtInput);
    }
  };

  renderValueInput(opSelect.value, true);
  opSelect.addEventListener("change", (e) =>
    renderValueInput(e.target.value, false),
  );

  const removeBtn = document.createElement("button");
  removeBtn.innerHTML = "&times;";
  removeBtn.style.cssText =
    "background: none; border: none; color: #ef4444; font-size: 22px; cursor: pointer; margin-left: auto;";
  removeBtn.onclick = () => row.remove();

  row.appendChild(label);
  row.appendChild(opSelect);
  row.appendChild(valueContainer);
  row.appendChild(removeBtn);
  container.appendChild(row);
}

function addDefaultFilters() {
  if (globalAvailableFilters["spent_on"]) {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const formatDate = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };
    addFilterRow("spent_on", globalAvailableFilters["spent_on"], "><", [
      formatDate(firstDay),
      formatDate(lastDay),
    ]);
  }
  if (globalAvailableFilters["user_id"]) {
    addFilterRow("user_id", globalAvailableFilters["user_id"], "=", ["me"]);
  }
}

async function handleGenerateReport() {
  const container = document.getElementById("activeFiltersContainer");
  const rows = container.querySelectorAll(".dynamic-filter-row");
  const resultContainer = document.getElementById("reportResultContainer");
  const tHead = document.getElementById("reportResultHead");
  const tBody = document.getElementById("reportResultBody");
  const btnGenerate = document.getElementById("btnGenerateReport");

  const params = new URLSearchParams();
  params.append("set_filter", "1");
  params.append("sort", "spent_on:desc");
  params.append(
    "columns",
    document.getElementById("reportColumnsSelect").value,
  );
  const criteria = document.getElementById("reportCriteriaSelect").value;
  if (criteria) params.append("criteria[]", criteria);

  rows.forEach((row) => {
    const opSelect = row.querySelector(".operator-select");
    const fieldKey = opSelect.dataset.field;
    const operator = opSelect.value;
    params.append("f[]", fieldKey);
    params.append(`op[${fieldKey}]`, operator);
    if (operator !== "*" && operator !== "!*") {
      const val1 = row.querySelector(".filter-value");
      if (val1 && val1.value) params.append(`v[${fieldKey}][]`, val1.value);
      if (operator === "><") {
        const val2 = row.querySelector(".filter-value-2");
        if (val2 && val2.value) params.append(`v[${fieldKey}][]`, val2.value);
      }
    }
  });
  params.append("f[]", "");

  resultContainer.style.display = "block";
  tBody.innerHTML = `<tr><td class="empty-table" style="text-align:center; padding: 20px;">Loading report...</td></tr>`;
  btnGenerate.disabled = true;

  try {
    const res = await fetchWithAuth(
      `/api/redmine/generate-report?${params.toString()}`,
    );
    const result = await res.json();
    if (result.success && result.data.headers.length > 0) {
      let headHtml =
        "<tr>" +
        result.data.headers
          .map(
            (h) =>
              `<th style="background:#f8fafc; padding:10px; border-bottom:2px solid #e2e8f0; text-align:left;">${h}</th>`,
          )
          .join("") +
        "</tr>";
      tHead.innerHTML = headHtml;

      let bodyHtml = result.data.rows
        .map((row) => {
          let rowHtml = `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px; font-weight:600;">${row.name}</td>`;
          rowHtml += row.hours
            .map((h, i) => {
              const isTotal = i === row.hours.length - 1;
              return `<td style="padding:10px; ${isTotal ? "font-weight:bold; color:#0f172a;" : "color:#64748b;"}">${h || "-"}</td>`;
            })
            .join("");
          return rowHtml + "</tr>";
        })
        .join("");

      if (result.data.totals.length > 0) {
        bodyHtml +=
          `<tr style="background:#f8fafc; font-weight:bold; border-top:2px solid #cbd5e0;"><td style="padding:12px 10px;">Total time</td>` +
          result.data.totals
            .map(
              (t) => `<td style="padding:12px 10px; color:#2563eb;">${t}</td>`,
            )
            .join("") +
          "</tr>";
      }
      tBody.innerHTML = bodyHtml;
    } else {
      tBody.innerHTML = `<tr><td class="empty-table" style="text-align:center; padding: 20px;">No data.</td></tr>`;
    }
  } catch (error) {
    tBody.innerHTML = `<tr><td class="empty-table" style="color:red">Failed to fetch data.</td></tr>`;
  } finally {
    btnGenerate.disabled = false;
  }
}
