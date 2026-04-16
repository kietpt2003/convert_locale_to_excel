export function initChatAgent() {
  const widget = document.getElementById("agent-widget");
  const bubble = document.getElementById("agent-bubble");
  const windowEl = document.getElementById("agent-window");
  const header = document.getElementById("agent-header");
  const closeBtn = document.getElementById("agent-close-btn");

  if (!widget || !bubble || !windowEl) return;

  let isDragging = false;
  let isMoved = false;
  let startX, startY, initialX, initialY;

  function dragStart(e) {
    isDragging = true;
    isMoved = false;
    const clientX = e.type.includes("mouse") ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes("mouse") ? e.clientY : e.touches[0].clientY;
    startX = clientX;
    startY = clientY;
    const rect = widget.getBoundingClientRect();
    initialX = rect.left;
    initialY = rect.top;
    widget.style.transition = "none";
  }

  function drag(e) {
    if (!isDragging) return;
    const clientX = e.type.includes("mouse") ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes("mouse") ? e.clientY : e.touches[0].clientY;
    const dx = clientX - startX;
    const dy = clientY - startY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isMoved = true;

    let newX = initialX + dx;
    let newY = initialY + dy;
    const maxX = window.innerWidth - widget.offsetWidth;
    const maxY = window.innerHeight - widget.offsetHeight;

    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    widget.style.left = `${newX}px`;
    widget.style.top = `${newY}px`;
    widget.style.right = "auto";
    widget.style.bottom = "auto";
  }

  function snapToEdge() {
    widget.style.transition = "left 0.3s ease-out, top 0.3s ease-out";
    const rect = widget.getBoundingClientRect();
    const margin = 20;
    let newLeft =
      rect.left + rect.width / 2 < window.innerWidth / 2
        ? margin
        : window.innerWidth - rect.width - margin;
    let newTop = Math.max(
      margin,
      Math.min(rect.top, window.innerHeight - rect.height - margin),
    );

    widget.style.left = `${newLeft}px`;
    widget.style.top = `${newTop}px`;
  }

  function dragEnd() {
    if (!isDragging) return;
    isDragging = false;
    if (isMoved) resetPosition();
  }

  function resetPosition() {
    // Tăng thời gian lên 0.6s và dùng cubic-bezier để tạo độ trượt mượt mà (chậm dần về cuối)
    widget.style.transition =
      "left 0.6s cubic-bezier(0.2, 0.8, 0.2, 1), top 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)";

    // Xóa bỏ left và top inline đi
    widget.style.left = "";
    widget.style.top = "";

    // Phục hồi lại right và bottom để CSS stylesheet làm việc
    widget.style.right = "20px";
    widget.style.bottom = "20px";

    // Đồng bộ thời gian chờ với transition (0.6s = 600ms)
    setTimeout(() => {
      widget.style.transition = "none";
    }, 600);
  }

  function toggleChat() {
    if (isMoved) return;
    const isOpening =
      windowEl.style.display === "none" || windowEl.style.display === "";
    if (isOpening) {
      bubble.style.display = "none";
      windowEl.style.display = "flex";
    } else {
      windowEl.style.display = "none";
      bubble.style.display = "flex";
    }
    resetPosition(); // Và sửa ở đây
  }

  // Gắn sự kiện
  [bubble, header].forEach((el) => {
    el.addEventListener("mousedown", dragStart);
    el.addEventListener("touchstart", dragStart, { passive: false });
  });

  document.addEventListener("mousemove", drag);
  document.addEventListener("mouseup", dragEnd);
  document.addEventListener("touchmove", drag, { passive: false });
  document.addEventListener("touchend", dragEnd);

  bubble.addEventListener("click", toggleChat);
  closeBtn.addEventListener("click", toggleChat);

  // Xử lý gửi tin nhắn UI
  const sendBtn = document.getElementById("agent-send-btn");
  const inputEl = document.getElementById("agent-input");
  const messagesDiv = document.getElementById("agent-messages");

  if (sendBtn && inputEl && messagesDiv) {
    sendBtn.addEventListener("click", async () => {
      const text = inputEl.value.trim();
      if (!text) return;

      messagesDiv.innerHTML += `<div class="msg user">${text}</div>`;
      inputEl.value = "";
      messagesDiv.scrollTop = messagesDiv.scrollHeight;

      // Disable input
      inputEl.disabled = true;
      sendBtn.disabled = true;
      sendBtn.style.opacity = "0.5";

      const botMsgId = "msg-" + Date.now();
      messagesDiv.innerHTML += `<div class="msg bot" id="${botMsgId}">
        <span style="opacity: 0.6;">Kiet Junior is thinking...</span>
      </div>`;
      messagesDiv.scrollTop = messagesDiv.scrollHeight;

      const botMsgEl = document.getElementById(botMsgId);

      await streamAgentReply(text, botMsgEl, messagesDiv, inputEl, sendBtn);
    });

    inputEl.addEventListener("keypress", (e) => {
      if (e.key === "Enter") sendBtn.click();
    });
  }
}

export async function streamAgentReply(
  message,
  botMsgEl,
  messagesDiv,
  inputEl,
  sendBtn,
) {
  try {
    // =========================================================
    // 1. GỌI API ĐỂ LẤY URL CỦA CHAT AGENT
    // =========================================================
    const urlResponse = await fetch("/get-agent-url", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("app_token")}`,
      },
    });

    // If API get URL error -> Show error into chat screen and stop
    if (!urlResponse.ok) {
      let errMsg =
        "Kiet Junior is not responding at the moment; we apologize for the inconvenience.";
      try {
        const errData = await urlResponse.json();
        errMsg = errData.message || errMsg;
      } catch (e) {}

      botMsgEl.innerHTML = `${errMsg}`;
      return; // Stop
    }

    const urlData = await urlResponse.json();
    const chatApiUrl = urlData.url;

    if (!chatApiUrl) {
      botMsgEl.innerHTML =
        "Kiet Junior is not responding at the moment; we apologize for the inconvenience.";
      return;
    }

    const response = await fetch(chatApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("app_token")}`,
      },
      body: JSON.stringify({ question: message }),
    });

    if (!response.body) throw new Error("Browser not support Streaming data.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let buffer = "";
    let isFirstChunk = true;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");

      buffer = parts.pop() || "";

      for (const part of parts) {
        if (part.trim()) {
          // Lọc bỏ tiền tố "data: " nếu server dùng chuẩn SSE
          const jsonStr = part.replace(/^data:\s*/, "").trim();

          // --- MỚI THÊM: Xử lý tín hiệu kết thúc từ Server ---
          if (jsonStr === "[DONE]") {
            break; // Thoát khỏi vòng lặp xử lý part
          }

          try {
            const parsed = JSON.parse(jsonStr);

            // --- MỚI THÊM: BẮT LỖI TỪ SERVER (TIMEOUT, LỖI LLM...) ---
            if (parsed.error) {
              if (isFirstChunk) {
                botMsgEl.innerHTML = "";
                isFirstChunk = false;
              }
              // Hiển thị chữ màu đỏ hoặc nổi bật để user biết là lỗi
              botMsgEl.innerHTML += `<br><span style="color: #dc2626; font-weight: 500;">⚠️ ${parsed.error}</span>`;
              messagesDiv.scrollTop = messagesDiv.scrollHeight;

              // Chủ động ngắt stream luôn vì đã có lỗi
              return;
            }

            // --- XỬ LÝ TEXT BÌNH THƯỜNG ---
            if (parsed.answer) {
              if (isFirstChunk) {
                botMsgEl.innerHTML = ""; // Remove "Thinking..."
                isFirstChunk = false;
              }

              // Replace \n thành <br> để xuống dòng an toàn trong HTML
              const safeText = parsed.answer.replace(/\n/g, "<br>");
              botMsgEl.innerHTML += safeText;
              messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }
          } catch (e) {
            // Bỏ qua lỗi JSON xé dở
          }
        }
      }
    }
  } catch (error) {
    botMsgEl.innerHTML =
      "Kiet Junior is not responding at the moment; we apologize for the inconvenience.";
  } finally {
    // ===============================================
    // MỞ KHÓA LẠI SAU KHI HOÀN TẤT (Hoặc khi có lỗi)
    // ===============================================
    if (inputEl && sendBtn) {
      inputEl.disabled = false;
      sendBtn.disabled = false;
      sendBtn.style.opacity = "1";
      inputEl.focus();
    }
  }
}
