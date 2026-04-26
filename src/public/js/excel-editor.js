document.addEventListener("DOMContentLoaded", () => {
  const tbody = document.getElementById("excel-tbody");
  const fileInput = document.getElementById("excel-file");
  const floatingBtn = document.getElementById("floating-insert-btn");
  const indicator = document.getElementById("insert-indicator");
  const exportBtn = document.getElementById("export-btn");
  const addRowBtn = document.getElementById("add-row-btn");
  const rowIndexInput = document.getElementById("row-index");
  const previewTbody = document.getElementById("preview-tbody");

  let targetIndex = -1;

  function updatePreview() {
    const rows = Array.from(tbody.querySelectorAll("tr"));
    previewTbody.innerHTML = "";

    if (rows.length === 0) {
      previewTbody.innerHTML = `<tr><td colspan="2" style="text-align:center; padding:40px; color:#94a3b8;">No data to preview</td></tr>`;
      return;
    }

    rows.forEach((tr) => {
      const status = tr.querySelector(".status-select").value;
      if (status !== "Removed") {
        const key = tr.querySelector(".in-key").value;
        const val = tr.querySelector(".in-new").value;

        const preTr = document.createElement("tr");

        const tdKey = document.createElement("td");
        tdKey.className = "preview-key";
        tdKey.style.cssText =
          "padding: 10px; border-bottom: 1px solid #f1f5f9;";
        tdKey.textContent = key || "N/A"; // Dùng textContent thay vì innerHTML

        const tdVal = document.createElement("td");
        tdVal.className = "preview-val";
        tdVal.style.cssText = `
            padding: 10px; 
            border-bottom: 1px solid #f1f5f9; 
            color: #64748b;
            white-space: pre-wrap; /* Giúp hiển thị xuống dòng giống textarea */
            word-break: break-all;
        `;
        tdVal.textContent = val;

        preTr.appendChild(tdKey);
        preTr.appendChild(tdVal);
        previewTbody.appendChild(preTr);
      }
    });
  }

  function createRow(
    data = { key: "", old: "", new: "", status: "Unchanged" },
  ) {
    const tr = document.createElement("tr");
    tr.className = `row-${data.status.toLowerCase()}`;

    tr.innerHTML = `
        <td><textarea class="in-key" rows="1"></textarea></td>
        <td><textarea class="in-old" rows="1" readonly style="opacity: 0.7; cursor: not-allowed;"></textarea></td>
        <td><textarea class="in-new" rows="1"></textarea></td>
        <td>
            <select class="status-select">
                <option value="Unchanged">Unchanged</option>
                <option value="Modified">Modified</option>
                <option value="Added">Added</option>
                <option value="Removed">Removed</option>
            </select>
        </td>
    `;

    const inKey = tr.querySelector(".in-key");
    const inOld = tr.querySelector(".in-old");
    const inNew = tr.querySelector(".in-new");
    const statusSelect = tr.querySelector(".status-select");

    // Hàm tự động giãn độ cao theo nội dung
    const autoResize = (el) => {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    };

    // Gán dữ liệu an toàn
    inKey.value = data.key || "";
    inOld.value = data.old || "";
    inNew.value = data.new || "";
    statusSelect.value = data.status || "Unchanged";

    // Thực hiện resize ngay sau khi gán data
    setTimeout(() => {
      [inKey, inOld, inNew].forEach(autoResize);
    }, 0);

    const syncStatusAndColor = () => {
      const isModified = inNew.value !== inOld.value;
      if (
        statusSelect.value === "Unchanged" ||
        statusSelect.value === "Modified"
      ) {
        statusSelect.value = isModified ? "Modified" : "Unchanged";
      }
      tr.className = `row-${statusSelect.value.toLowerCase()}`;
      checkDuplicateKey(inKey);
      updatePreview();
    };

    // Sự kiện cho textarea
    [inKey, inNew].forEach((el) => {
      el.addEventListener("input", (e) => {
        autoResize(e.target);
        syncStatusAndColor();
      });
    });

    statusSelect.addEventListener("change", () => {
      tr.className = `row-${statusSelect.value.toLowerCase()}`;
      updatePreview();
    });

    return tr;
  }

  // --- HÀM CHECK TRÙNG KEY (Bổ trợ) ---
  function checkDuplicateKey(currentInput) {
    const allKeyInputs = Array.from(document.querySelectorAll(".in-key"));
    const currentValue = currentInput.value.trim();

    // Reset trạng thái lỗi trước khi check
    currentInput.style.boxShadow = "";
    currentInput.style.borderColor = "transparent";
    currentInput.title = "";

    if (currentValue === "") return false;

    // Kiểm tra xem có key nào khác trùng không
    const isDuplicate = allKeyInputs.some(
      (input) => input !== currentInput && input.value.trim() === currentValue,
    );

    if (isDuplicate) {
      // Sử dụng boxShadow để nổi bật trên nền màu của dòng
      currentInput.style.boxShadow = "inset 0 0 0 2px #ef4444";
      currentInput.style.borderColor = "#ef4444";
      currentInput.title = "⚠️ Warning: Key already exist in this sheet!";

      // Thêm class hiệu ứng rung (shake)
      currentInput.classList.add("shake-error");
      setTimeout(() => currentInput.classList.remove("shake-error"), 500);
    }

    return isDuplicate;
  }

  // --- 2. LOGIC HOVER CHÈN DÒNG THÔNG MINH ---
  tbody.addEventListener("mousemove", (e) => {
    const rows = Array.from(tbody.querySelectorAll("tr"));
    if (rows.length === 0) return;

    let found = false;
    const tableRect = tbody.closest(".excel-table").getBoundingClientRect();

    rows.forEach((row, index) => {
      const rect = row.getBoundingClientRect();
      // Kiểm tra vùng 20px xung quanh đường kẻ giữa các dòng
      if (e.clientY > rect.top - 10 && e.clientY < rect.top + 10) {
        const y = rect.top + window.scrollY;
        showInsertControls(y, index);
        found = true;
      }
    });

    // Kiểm tra dòng cuối cùng
    if (!found) {
      const lastRow = rows[rows.length - 1];
      const lastRect = lastRow.getBoundingClientRect();
      if (
        e.clientY > lastRect.bottom - 10 &&
        e.clientY < lastRect.bottom + 10
      ) {
        const y = lastRect.bottom + window.scrollY;
        showInsertControls(y, rows.length);
        found = true;
      }
    }

    if (!found) hideInsertControls();
  });

  function showInsertControls(y, index) {
    const wrapper = document.getElementById("table-wrapper");
    const rect = wrapper.getBoundingClientRect();

    // Hiển thị nút
    floatingBtn.style.display = "flex";
    floatingBtn.style.top = `${y}px`;

    // Đặt nút nằm ở mép trái bên trong vùng Editor (cách lề khoảng 10px)
    floatingBtn.style.left = `${rect.left + 10}px`;

    // Hiển thị đường kẻ
    indicator.style.display = "block";
    indicator.style.top = `${y}px`;

    // Ép đường kẻ bắt đầu và kết thúc đúng trong khung Editor
    indicator.style.left = `${rect.left}px`;
    indicator.style.width = `${rect.width}px`;

    targetIndex = index;
  }

  function hideInsertControls() {
    // Chỉ ẩn nếu chuột không đang hover trên chính cái nút ➕
    if (!floatingBtn.matches(":hover")) {
      floatingBtn.style.display = "none";
      indicator.style.display = "none";
    }
  }

  floatingBtn.addEventListener("click", () => {
    const newRow = createRow();
    if (targetIndex >= 0 && tbody.children[targetIndex]) {
      tbody.insertBefore(newRow, tbody.children[targetIndex]);
    } else {
      tbody.appendChild(newRow);
    }
    hideInsertControls();
  });

  // --- 3. XỬ LÝ IMPORT FILE ---
  // --- 3. XỬ LÝ IMPORT FILE ---
  // --- 3. XỬ LÝ IMPORT FILE ---
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: "binary" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet);

        tbody.innerHTML = "";
        data.forEach((item) => {
          // Map dữ liệu từ file vào hàm tạo dòng
          tbody.appendChild(
            createRow({
              key: item["Key"] || item["key"] || "",
              old: item["Old Value"] || item["old"] || "",
              new: item["New Value"] || item["new"] || "",
              status: item["Status"] || item["status"] || "Unchanged",
            }),
          );
        });

        const allKeys = tbody.querySelectorAll(".in-key");
        allKeys.forEach((input) => checkDuplicateKey(input));

        // QUAN TRỌNG: Gọi hàm này để hiển thị Preview ngay sau khi load xong dữ liệu
        updatePreview();

        fileInput.value = ""; // Reset để có thể chọn lại cùng file
        console.log("✅ Import thành công và đã cập nhật Preview");
      } catch (error) {
        console.error("Lỗi khi import:", error);
        alert("Có lỗi xảy ra khi đọc file Excel.");
      }
    };
    reader.readAsBinaryString(file);
  });

  // --- 4. CHÈN DÒNG BẰNG INPUT INDEX ---
  addRowBtn.addEventListener("click", () => {
    const idx = rowIndexInput.value;
    const newRow = createRow();
    if (idx !== "" && tbody.children[idx]) {
      tbody.insertBefore(newRow, tbody.children[idx]);
    } else {
      tbody.appendChild(newRow);
    }
  });

  // --- 5. EXPORT FILE FINAL ---
  exportBtn.addEventListener("click", () => {
    const rows = Array.from(tbody.querySelectorAll("tr"));
    const finalData = rows
      .map((tr) => {
        const status = tr.querySelector(".status-select").value;
        if (status === "Removed") return null;
        // .value lấy chính xác những gì bạn thấy trong ô input
        return [
          tr.querySelector(".in-key").value,
          tr.querySelector(".in-new").value,
        ];
      })
      .filter((x) => x !== null);

    if (finalData.length === 0) return alert("No data!");

    const ws = XLSX.utils.aoa_to_sheet(finalData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Final");
    XLSX.writeFile(wb, "Final_Data.xlsx");
  });

  floatingBtn.addEventListener("click", () => {
    // ... (logic chèn dòng cũ)
    updatePreview();
  });
});
