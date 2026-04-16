// Lấy các DOM Elements
const fileInput = document.getElementById("svg-file-input");
const inputTextArea = document.getElementById("svg-input-textarea");
const outputTextArea = document.getElementById("svg-output-textarea");
const analyzeBtn = document.getElementById("btn-analyze");
const traceBtn = document.getElementById("btn-trace");
const copyBtn = document.getElementById("btn-copy");
const statusBox = document.getElementById("status-box");
const previewIcon = document.getElementById("preview-icon");
const previewBox = document.getElementById("preview-box");
const previewPlaceholder = document.getElementById("preview-placeholder");

// Sự kiện khi upload file
fileInput.addEventListener("change", handleFileUpload);

// Sự kiện khi bấm nút Analyze
analyzeBtn.addEventListener("click", () => {
  const code = inputTextArea.value.trim();
  if (code) analyzeAndNormalizeSvg(code);
});

// Sự kiện khi bấm nút Trace "Phép thuật"
traceBtn.addEventListener("click", traceEmbeddedImage);

// Sự kiện nút Copy
copyBtn.addEventListener("click", copyResultCode);

// --- XỬ LÝ CHÍNH ---

// Hàm Analyze và Normalize (Gộp tính năng 1 và 2)
function analyzeAndNormalizeSvg(svgString) {
  analyzeBtn.innerText = "Analyzing...";
  analyzeBtn.disabled = true;
  outputTextArea.value = "";
  outputTextArea.style.display = "block";
  previewIcon.innerHTML = "";
  previewIcon.style.display = "none";
  previewPlaceholder.style.display = "none";
  statusBox.style.display = "none";
  statusBox.classList.remove("status-success", "status-error");

  // Thêm độ trễ nhẹ để tạo cảm giác xử lý chuyên nghiệp
  setTimeout(() => {
    // 1. TÍNH NĂNG 1: PHÁT HIỆN FAKE SVG
    const isFakeSvg =
      /<image\s/i.test(svgString) ||
      /data:image\/(png|jpeg|jpg)/i.test(svgString);

    if (isFakeSvg) {
      // Hiện báo động đỏ
      showStatus(
        "🚨 FAKE SVG DETECTED! File này chứa ảnh tĩnh (PNG/JPG) bị Designer nhúng vào bên trong. Không thể sử dụng thuộc tính currentColor. Hãy yêu cầu Designer vẽ lại và xuất lại Vector chuẩn!",
        "error",
      );
      outputTextArea.value = svgString;
      traceBtn.disabled = false; // Bật nút phép thuật Trace ảnh
      analyzeBtn.innerText = "Analyze & Convert";
      analyzeBtn.disabled = false;
      return; // Dừng luồng xử lý
    }

    // 2. TÍNH NĂNG 2: CHUẨN HÓA SVG THẬT (NORMALIZE)
    let cleanSvg = svgString;

    // Xóa rác Figma rườm rà (defs, clipPath)
    cleanSvg = cleanSvg.replace(/<defs>[\s\S]*?<\/defs>/gi, "");
    cleanSvg = cleanSvg.replace(/<clipPath[\s\S]*?<\/clipPath>/gi, "");
    cleanSvg = cleanSvg.replace(/clip-path="url\([^)]+\)"/gi, "");
    cleanSvg = cleanSvg.replace(/<desc>[\s\S]*?<\/desc>/gi, ""); // Xóa mô tả Figma

    // TỰ ĐỘNG THAY MÃ MÀU CỨNG THÀNH CURRENTCOLOR
    // Regex tìm fill="#" hoặc stroke="#", bỏ qua none, bỏ qua fill="white" nếu icon nền trắng
    cleanSvg = cleanSvg.replace(
      /fill="(?!none)(?!white)[^"]+"/gi,
      'fill="currentColor"',
    );
    cleanSvg = cleanSvg.replace(
      /stroke="(?!none)(?!white)[^"]+"/gi,
      'stroke="currentColor"',
    );

    // Chuyển width/height thành 100% để RN responsive
    if (/<svg\s/i.test(cleanSvg) && !/viewBox="/i.test(cleanSvg)) {
      // Nếu không có viewBox, RN sẽ bị lỗi, ta cần báo lỗi hoặc tính toán thêm.
      // Tạm thời tool sẽ cảnh báo
      showStatus(
        "⚠️ SVG này thiếu viewBox! react-native-svg có thể render sai kích thước.",
        "error",
      );
    }
    cleanSvg = cleanSvg.replace(/width="[^"]+"/i, 'width="100%"');
    cleanSvg = cleanSvg.replace(/height="[^"]+"/i, 'height="100%"');

    // Hiển thị kết quả
    outputTextArea.value = cleanSvg;
    showStatus(
      "✅ Chuẩn hóa SVG thành công! Mã màu cứng đã được chuyển sang currentColor.",
      "success",
    );
    updatePreview(cleanSvg);
    traceBtn.disabled = true; // SVG thật thì không cần Trace ảnh

    analyzeBtn.innerText = "Analyze & Convert";
    analyzeBtn.disabled = false;
  }, 800);
}

// 3. TÍNH NĂNG 3: ÉP KIỂU ẢNH THÀNH VECTOR (MAGICAL TRACE)
// function traceEmbeddedImage() {
//   const fakeSvg = inputTextArea.value.trim();
//   traceBtn.innerText = "✨ Casting Spell (Tracing)...";
//   traceBtn.disabled = true;
//   analyzeBtn.disabled = true;

//   // Lấy ra chuỗi base64 của ảnh bị nhúng
//   const match = fakeSvg.match(
//     /href="(data:image\/(png|jpeg|jpg);base64,[^"]+)"/i,
//   );

//   if (!match || !match[1]) {
//     showStatus("❌ Lỗi: Không thể tìm thấy dữ liệu ảnh để tự đồ nét.", "error");
//     traceBtn.innerText = "🪄 Magical Trace (Fake SVG → Vector)";
//     traceBtn.disabled = false;
//     analyzeBtn.disabled = false;
//     return;
//   }

//   const base64ImageUrl = match[1];

//   // Sử dụng thư viện ImageTracerJS đã nhúng trong HTML
//   // Tool sẽ đồ nét tự động dựa trên độ tương phản
//   ImageTracer.imageToSVG(
//     base64ImageUrl,
//     function (tracedSvgString) {
//       // Đồ nét xong -> Xử lý kết quả trả về
//       analyzeBtn.disabled = false;
//       traceBtn.innerText = "🪄 Magical Trace (Fake SVG → Vector)";
//       traceBtn.disabled = false;

//       // Chuẩn hóa cái SVG vừa đồ nét
//       let finalTracedSvg = tracedSvgString;

//       // Xóa màu nền trắng nếu ImageTracer tạo ra
//       finalTracedSvg = finalTracedSvg.replace(
//         /<rect[^>]*fill="white"[^>]*><\/rect>/gi,
//         "",
//       );

//       // Ép mã màu fill cứng sang currentColor để RN transformer xài được
//       finalTracedSvg = finalTracedSvg.replace(
//         /fill="[^"]+"/gi,
//         'fill="currentColor"',
//       );

//       // Tăng kích thước nét mặc định một chút cho icon RN dễ nhìn
//       // finalTracedSvg = finalTracedSvg.replace(/stroke-width="[^"]+"/gi, 'stroke-width="2"');

//       // Hiển thị kết quả đồ nét
//       outputTextArea.value = finalTracedSvg;
//       showStatus(
//         '✨ Phép thuật thành công! Ảnh fake đã được "đồ" lại thành Vector. Key này hiện có thể đổi màu Prop fill/currentColor.',
//         "success",
//       );
//       updatePreview(finalTracedSvg);
//     },
//     {
//       // Options của ImageTracer - Tinh chỉnh cho Icon single-color
//       ltres: 1, // Line tolerance
//       qtres: 1, // Spline tolerance
//       pathomit: 8, // Omit tiny paths
//       colorsampling: 0, // No colors (single-color)
//       strokewidth: 1,
//     },
//   );
// }

// 3. TÍNH NĂNG 3: ÉP KIỂU ẢNH THÀNH VECTOR (MAGICAL TRACE)
function traceEmbeddedImage() {
  const fakeSvg = inputTextArea.value.trim();
  traceBtn.innerText = "✨ Casting Spell (Tracing)...";
  traceBtn.disabled = true;
  analyzeBtn.disabled = true;

  // Lấy ra chuỗi base64 của ảnh bị nhúng
  const match = fakeSvg.match(
    /href="(data:image\/(png|jpeg|jpg);base64,[^"]+)"/i,
  );

  if (!match || !match[1]) {
    showStatus("❌ Lỗi: Không thể tìm thấy dữ liệu ảnh để tự đồ nét.", "error");
    traceBtn.innerText = "🪄 Magical Trace (Fake SVG → Vector)";
    traceBtn.disabled = false;
    analyzeBtn.disabled = false;
    return;
  }

  const base64ImageUrl = match[1];

  ImageTracer.imageToSVG(
    base64ImageUrl,
    function (tracedSvgString) {
      analyzeBtn.disabled = false;
      traceBtn.innerText = "🪄 Magical Trace (Fake SVG → Vector)";
      traceBtn.disabled = false;

      let finalTracedSvg = tracedSvgString;

      // =======================================================
      // 1. TỰ ĐỘNG BƠM VIEWBOX CHO SVG
      // =======================================================
      const wMatch = finalTracedSvg.match(/width="([\d.]+)"/i);
      const hMatch = finalTracedSvg.match(/height="([\d.]+)"/i);

      if (wMatch && hMatch && !/viewBox/i.test(finalTracedSvg)) {
        finalTracedSvg = finalTracedSvg.replace(
          /<svg\s/i,
          `<svg viewBox="0 0 ${wMatch[1]} ${hMatch[1]}" `,
        );
      }

      finalTracedSvg = finalTracedSvg.replace(/width="[^"]+"/i, 'width="100%"');
      finalTracedSvg = finalTracedSvg.replace(
        /height="[^"]+"/i,
        'height="100%"',
      );

      // =======================================================
      // 2. DỌN SẠCH NỀN TRẮNG (Sát thủ bắt thẻ tự đóng />)
      // =======================================================
      // Regex này bao trọn cả thẻ <path ... /> lẫn <path></path>
      finalTracedSvg = finalTracedSvg.replace(
        /<(path|rect)[^>]*fill="(rgb\(255,\s*255,\s*255\)|#ffffff|#fff)"[^>]*\/?>(<\/\1>)?/gi,
        "",
      );

      // =======================================================
      // 3. XÓA VIỀN THỪA & ÉP CURRENTCOLOR
      // =======================================================
      // Thư viện tracer hay tự sinh ra viền đen (stroke) làm icon rất xấu, ta xóa luôn
      finalTracedSvg = finalTracedSvg.replace(/\sstroke="[^"]*"/gi, "");
      finalTracedSvg = finalTracedSvg.replace(/\sstroke-width="[^"]*"/gi, "");

      // Ép tất cả các nét vẽ còn lại thành currentColor
      finalTracedSvg = finalTracedSvg.replace(
        /fill="[^"]+"/gi,
        'fill="currentColor"',
      );

      // Hiển thị kết quả
      outputTextArea.value = finalTracedSvg;
      showStatus(
        '✨ Phép thuật thành công! Ảnh fake đã được dọn sạch nền và "đồ" lại thành Vector mượt mà.',
        "success",
      );

      // Cấp màu Teal cho cái khung div cha để currentColor có màu mà hiển thị
      previewIcon.style.color = "#000000";

      updatePreview(finalTracedSvg);
    },
    {
      ltres: 1,
      qtres: 1,
      pathomit: 8,
      colorsampling: 0,
      strokewidth: 1,
    },
  );
}

// --- HÀM BỔ TRỢ ---

// Đọc file SVG upload
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    inputTextArea.value = e.target.result;
    analyzeAndNormalizeSvg(e.target.result); // Up xong tự Analyze luôn
  };
  reader.readAsText(file);
}

// Cập nhật khung preview icon
function updatePreview(svgString) {
  outputTextArea.style.display = "block"; // Giữ textarea
  previewBox.style.display = "flex"; // Hiện preview
  previewIcon.innerHTML = svgString;
  previewIcon.style.display = "block";
  previewPlaceholder.style.display = "none";
}

// Hiển thị hộp thông báo status
function showStatus(message, type) {
  statusBox.innerText = message;
  statusBox.style.display = "block";
  if (type === "success") {
    statusBox.classList.remove("status-error");
    statusBox.classList.add("status-success");
  } else {
    statusBox.classList.remove("status-success");
    statusBox.classList.add("status-error");
  }
}

// Copy kết quả
function copyResultCode() {
  const resultCode = outputTextArea.value;
  if (!resultCode) return;

  navigator.clipboard.writeText(resultCode).then(() => {
    copyBtn.innerText = "Copied!";
    copyBtn.style.backgroundColor = "#4ade80";
    setTimeout(() => {
      copyBtn.innerText = "Copy Code";
      copyBtn.style.backgroundColor = "#e2e8f0";
    }, 2000);
  });
}
