const SERVER_URL = "https://convert-locale-to-excel.onrender.com";
let socket;
let replyingTo = null;
let currentChatTarget = "ALL";

const navEntries = performance.getEntriesByType("navigation");
if (navEntries.length > 0 && navEntries[0].type === "reload") {
  sessionStorage.removeItem("chatAppHistory");
}

let chatHistory = JSON.parse(sessionStorage.getItem("chatAppHistory")) || {
  ALL: [],
};

const saveHistoryToStorage = () => {
  sessionStorage.setItem("chatAppHistory", JSON.stringify(chatHistory));
};

export function initChatWidget(user) {
  if (!user || !user.email) {
    console.error("Missing user data for chat!");
    return;
  }

  socket = io(SERVER_URL);

  const chatBox = document.getElementById("chatBoxContainer");
  const msgInput = document.getElementById("chatMessageInput");
  const btnSend = document.getElementById("btnSendChat");

  const replyPreviewContainer = document.getElementById(
    "replyPreviewContainer",
  );
  const replyPreviewText = document.getElementById("replyPreviewText");
  const btnCancelReply = document.getElementById("btnCancelReply");

  const chatWidget = document.getElementById("fb-chat-widget");
  const chatHeader = document.getElementById("chatHeaderToggle");

  const onlineListPanel = document.getElementById("onlineUsersList");
  const chatTitle = document.getElementById("chatTitle");

  // ==========================================
  // HÀM BỔ TRỢ: XỬ LÝ TRẠNG THÁI REPLY
  // ==========================================
  const setReply = (msgData) => {
    replyingTo = msgData;
    if (replyPreviewContainer && replyPreviewText) {
      replyPreviewText.innerHTML = `Responding <strong>${msgData.user.name}</strong>: ${msgData.text}`;
      replyPreviewContainer.style.display = "flex";
      msgInput.focus();
    }
  };

  const cancelReply = () => {
    replyingTo = null;
    if (replyPreviewContainer) {
      replyPreviewContainer.style.display = "none";
    }
  };

  if (btnCancelReply) btnCancelReply.onclick = cancelReply;

  // Cụp / Mở khung chat
  if (chatHeader && chatWidget) {
    chatHeader.addEventListener("click", () => {
      chatWidget.classList.toggle("collapsed");
      if (!chatWidget.classList.contains("collapsed")) {
        msgInput.focus();
      }
    });
  }

  // ==========================================
  // HÀM RENDER TIN NHẮN
  // ==========================================
  const renderMessageBubble = (data, isPrivate = false) => {
    const isMyMsg = data.user?.email === user.email;
    const msgWrapper = document.createElement("div");
    msgWrapper.className = `chat-wrapper ${isMyMsg ? "mine" : "other"}`;

    if (!isMyMsg) {
      const avatar = document.createElement("img");
      avatar.className = "chat-avatar";
      avatar.src =
        data.user?.picture || "https://ui-avatars.com/api/?name=User";
      msgWrapper.appendChild(avatar);
    }

    const contentContainer = document.createElement("div");
    contentContainer.className = "chat-content-container";

    if (!isMyMsg && data.user?.name) {
      const senderName = document.createElement("div");
      senderName.className = "chat-sender-name";
      senderName.innerText = data.user.name;
      contentContainer.appendChild(senderName);
    }

    if (data.replyTo) {
      const quoteBlock = document.createElement("div");
      quoteBlock.className = "chat-quote";
      quoteBlock.innerHTML = `<strong>${data.replyTo.user.name}</strong>: ${data.replyTo.text}`;
      contentContainer.appendChild(quoteBlock);
    }

    const bubbleRow = document.createElement("div");
    bubbleRow.className = "chat-bubble-row";

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    if (isPrivate && isMyMsg) bubble.style.background = "#9333ea";
    bubble.innerText = data.text;

    const replyBtn = document.createElement("span");
    replyBtn.className = "chat-action-reply";
    replyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10h10a8 8 0 0 1 8 8v2M3 10l6 6m-6-6l6-6"/></svg>`;

    // 👉 ĐÃ FIX LỖI NÚT REPLY Ở ĐÂY:
    replyBtn.onclick = () => setReply(data);

    if (isMyMsg) {
      bubbleRow.appendChild(replyBtn);
      bubbleRow.appendChild(bubble);
    } else {
      bubbleRow.appendChild(bubble);
      bubbleRow.appendChild(replyBtn);
    }

    contentContainer.appendChild(bubbleRow);
    msgWrapper.appendChild(contentContainer);
    chatBox.appendChild(msgWrapper);
    chatBox.scrollTop = chatBox.scrollHeight;
  };

  const loadChatHistoryToUI = (targetEmail) => {
    if (!chatBox) return;

    chatBox.innerHTML = ""; // Xóa trắng khung chat cũ

    const history = chatHistory[targetEmail] || [];

    if (history.length === 0) {
      chatBox.innerHTML = `<div style="text-align:center;color:#94a3b8;font-size:12px;margin-top:10px;">${targetEmail === "ALL" ? "Start a group chat" : "Start a private conversation"}</div>`;
    } else {
      const isPrivate = targetEmail !== "ALL";
      history.forEach((msgData) => renderMessageBubble(msgData, isPrivate));
    }
  };

  loadChatHistoryToUI(currentChatTarget);

  // ==========================================
  // XỬ LÝ SỰ KIỆN SOCKET
  // ==========================================
  socket.on("connect", () => {
    socket.emit("user_joined", user);
  });

  socket.on("update_online_users", (usersArray) => {
    if (!onlineListPanel) return;

    onlineListPanel.innerHTML = `
      <div class="user-item ${currentChatTarget === "ALL" ? "active" : ""}" data-email="ALL">
        <div class="user-item-avatar">🌍</div>
        <div class="user-item-name">Team Chat</div>
      </div>
    `;

    usersArray.forEach((u) => {
      if (u.email === user.email) return;

      const div = document.createElement("div");
      div.className = `user-item ${currentChatTarget === u.email ? "active" : ""}`;
      div.dataset.email = u.email;
      div.innerHTML = `
        <div class="user-item-avatar">
          <img src="${u.picture || "https://ui-avatars.com/api/?name=User"}" />
        </div>
        <div class="user-item-name">${u.name}</div>
      `;
      onlineListPanel.appendChild(div);
    });

    // 👉 ĐÃ FIX LỖI ĐỔI TAB BỊ MẤT TIN NHẮN
    document.querySelectorAll(".user-item").forEach((item) => {
      item.onclick = function () {
        const targetEmail = this.getAttribute("data-email");
        const targetName = this.querySelector(".user-item-name").innerText;

        document
          .querySelectorAll(".user-item")
          .forEach((el) => el.classList.remove("active"));
        this.classList.add("active");
        chatTitle.innerText =
          targetEmail === "ALL" ? "Team Chat" : `Chat with ${targetName}`;

        currentChatTarget = targetEmail;

        loadChatHistoryToUI(targetEmail);
      };
    });
  });

  socket.on("announce_new_user", (u) => {
    if (u && u.email !== user.email) {
      showSlideBanner(`${u.name} is online. You can chat with each other.`);
    }
  });

  socket.on("receive_message", (data) => {
    // 👉 Lưu vào lịch sử Team Chat
    chatHistory["ALL"].push(data);
    saveHistoryToStorage();

    if (currentChatTarget === "ALL") {
      renderMessageBubble(data, false);
    } else {
      showSlideBanner(`Group message from ${data.user.name}: ${data.text}`);
    }
  });

  socket.on("receive_private_message", (data) => {
    const isMeSender = data.user.email === user.email;
    const conversationPartner = isMeSender ? data.toEmail : data.user.email;

    // 👉 Lưu vào lịch sử Chat Riêng của đối tác này
    if (!chatHistory[conversationPartner]) {
      chatHistory[conversationPartner] = [];
    }

    chatHistory[conversationPartner].push(data);
    saveHistoryToStorage();

    if (
      currentChatTarget === "ALL" &&
      currentChatTarget !== conversationPartner
    ) {
      showSlideBanner(
        `${data.user.name} sent you a private message: ${data.text}`,
      );
    } else if (currentChatTarget === conversationPartner) {
      renderMessageBubble(data, true);
    } else {
      showSlideBanner(
        `${data.user.name} sent you a private message: ${data.text}`,
      );
    }
  });

  // ==========================================
  // XỬ LÝ GIAO DIỆN (GỬI TIN NHẮN)
  // ==========================================
  const sendMessage = () => {
    if (!msgInput || !msgInput.value.trim()) return;

    const payload = {
      user: user,
      text: msgInput.value.trim(),
      replyTo: replyingTo,
    };

    if (currentChatTarget === "ALL") {
      socket.emit("send_message", payload);
    } else {
      payload.toEmail = currentChatTarget;
      socket.emit("send_private_message", payload);
    }

    msgInput.value = "";
    msgInput.focus();
    cancelReply();
  };

  if (btnSend) btnSend.onclick = sendMessage;
  if (msgInput) {
    msgInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendMessage();
      }
    });
  }
}

// ==========================================
// LOGIC HIỆU ỨNG BANNER LƯỚT NGANG (TOAST)
// ==========================================
function showSlideBanner(message) {
  let container = document.getElementById("chat-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "chat-toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = "chat-slide-toast";
  toast.innerText = message;
  container.appendChild(toast);

  setTimeout(() => toast.classList.add("show"), 10);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
