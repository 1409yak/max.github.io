// private-chat.js (with robust replies + optimistic merge via id)
import { postForm, getMessages } from './api.js';
import { loadAuth } from './auth.js';
import { formatTime } from './ui.js';

let privatePollTimer = null;
let currentPrivateChatUser = null;
let isPrivateScrolledToBottom = false;
let privateReplyTarget = null;

const privateChatUI = document.getElementById('privateChatUI');
const privateMessagesDiv = document.getElementById('privateMessages');
const privateScrollBottomBtn = document.getElementById('privateScrollBottomBtn');
const privateReplyPreviewDiv = document.getElementById('privateReplyPreview');
const privateMessageInput = document.getElementById('privateMessageInput');
const privateSendForm = document.getElementById('privateSendForm');
const backToMainChatBtn = document.getElementById('backToMainChat');
const privateChatUsernameSpan = document.getElementById('privateChatUsername');
const privateStickerBtn = document.getElementById('privateStickerBtn');
const privateAttachImageBtn = document.getElementById('privateAttachImageBtn');
const privateImageUpload = document.getElementById('privateImageUpload');

const notificationSound = new Audio("../sounds/notify.mp3");
const PENDING_PRIVATE_MESSAGES = new Map();

// Linkify text function
function linkifyText(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, url => {
    const safeUrl = url.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeUrl}</a>`;
  });
}

// Initialize private chat
export function initPrivateChat() {
  if (privateSendForm) {
    privateSendForm.addEventListener('submit', handlePrivateMessageSubmit);
  }

  privateMessageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Prevent newline
      privateSendForm.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });

  privateReplyPreviewDiv?.addEventListener('click', (e) => {
    if (e.target.id === 'cancelPrivateReplyBtn' || e.target.closest('#cancelPrivateReplyBtn')) {
      clearPrivateReplyTarget();
    }
  });

  if (backToMainChatBtn) {
    backToMainChatBtn.addEventListener('click', closePrivateChat);
  }

  if (privateScrollBottomBtn) {
    privateScrollBottomBtn.addEventListener('click', () => scrollPrivateMessagesToBottom(false));
  }

  // Add sticker button event listener
  if (privateStickerBtn) {
    privateStickerBtn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('openStickerPicker', { 
        detail: { isPrivate: true } 
      }));
    });
  }

  // Add image attachment event listeners
  if (privateAttachImageBtn && privateImageUpload) {
    privateAttachImageBtn.addEventListener('click', () => {
      privateImageUpload.click();
    });

    privateImageUpload.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const auth = loadAuth();
      if (!auth) return alert("Not logged in");

      const replyTarget = privateReplyTarget;

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result.split(',')[1]; // strip "data:image/png;base64,"
          await postForm({
            mode: 'uploadPrivateImage', // must match your Apps Script handler
            username: auth.u,
            password: auth.p,
            file: base64Data,
            name: file.name,
            type: file.type,
            reply_to: replyTarget ? replyTarget.id : '',
            send_to: currentPrivateChatUser
          });
        } catch (err) {
          console.error('Private image upload error:', err);
          alert('Failed to upload image');
        }
      };
      reader.readAsDataURL(file);

      // Reset the input so same file can be uploaded again
      e.target.value = '';
    });
  }
}

// Insert sticker into private chat with optimistic UX
export function insertPrivateSticker(stickerUrl) {
  if (!currentPrivateChatUser) return;

  const auth = loadAuth();
  if (!auth) return;

  const stickerText = `STICKER::${stickerUrl}`;
  const tempId = "temp-private-" + Date.now();
  const now = Date.now();

  const fakeMessage = {
    id: tempId,
    ts: now,
    username: auth.u,
    text: stickerText,
    optimistic: true,
    reply_to: null,
    reply_preview: null
  };

  PENDING_PRIVATE_MESSAGES.set(tempId, {
    text: stickerText,
    username: auth.u,
    ts: now,
    isSticker: true,
    isImage: false
  });

  const msgEl = createPrivateMessageElement(fakeMessage, "sent");
  insertPrivateMessageInOrder(msgEl, now);
  scrollPrivateMessagesToBottom(false);

  // ✅ close sticker modal immediately for fast UX
  const modal = document.getElementById('stickerModal');
  if (modal) {
    modal.hidden = true;
    document.body.style.overflow = '';
  }

  // send to server
  postForm({
    mode: 'sendPrivate',
    username: auth.u,
    password: auth.p,
    text: stickerText,
    send_to: currentPrivateChatUser
  })
    .then(resp => {
      const pendingEl = privateMessagesDiv.querySelector(`.msg[data-msg-id="${tempId}"]`);
      if (!pendingEl) return;
      if (resp.status === 'ok' && resp.id) {
        pendingEl.dataset.msgId = resp.id;
        updatePrivateMessageStatus(pendingEl, "delivered");
      } else {
        pendingEl.classList.add("failed");
        alert(resp.message || 'Failed to send sticker');
      }
      PENDING_PRIVATE_MESSAGES.delete(tempId);
    })
    .catch(err => {
      console.error('Private sticker send error:', err);
      const pendingEl = privateMessagesDiv.querySelector(`.msg[data-msg-id="${tempId}"]`);
      if (pendingEl) pendingEl.classList.add("failed");
      alert('Failed to send sticker');
    });
}

// Open private chat with a user
export function openPrivateChat(username) {
  const auth = loadAuth();
  if (!auth) return alert("Please log in first");

  if (auth.u === username) {
    return alert("You can't message yourself");
  }

  currentPrivateChatUser = username;
  privateChatUsernameSpan.textContent = username;

  // Hide main chat and show private chat
  document.getElementById('chatUI').hidden = true;
  privateChatUI.hidden = false;

  // Clear any existing reply target when opening a new chat
  clearPrivateReplyTarget();

  // Load private messages
  refreshPrivateMessages(true);
  startPrivatePolling();
}

// Close private chat
export function closePrivateChat() {
  stopPrivatePolling();
  privateChatUI.hidden = true;
  document.getElementById('chatUI').hidden = false;
  currentPrivateChatUser = null;
  clearPrivateReplyTarget();
}

// Handle private message submission
async function handlePrivateMessageSubmit(e) {
  e.preventDefault();

  const text = privateMessageInput.value.trim();
  if (!text || text.length === 0 || text.length > 500) {
    alert('Message must be 1–500 characters');
    return;
  }

  const auth = loadAuth();
  if (!auth) return;

  // Capture reply target BEFORE clearing
  const replyTarget = privateReplyTarget;

  // Clear input immediately but DON'T clear reply target yet
  privateMessageInput.value = '';
  clearPrivateReplyTarget();

  const tempId = "temp-private-" + Date.now();
  const now = Date.now();
  const fakeMessage = {
    id: tempId,
    ts: now,
    username: auth.u,
    text,
    optimistic: true,
    reply_to: replyTarget ? replyTarget.id : '',
    reply_preview: replyTarget ? {
      id: replyTarget.id,
      username: replyTarget.username,
      text: replyTarget.text
    } : null
  };

  PENDING_PRIVATE_MESSAGES.set(tempId, {
    text,
    username: auth.u,
    ts: now,
    reply_to: fakeMessage.reply_to,
    reply_preview: fakeMessage.reply_preview,
    isSticker: text.startsWith("STICKER::"),
    isImage: false
  });

  const msgEl = createPrivateMessageElement(fakeMessage, "sent");
  insertPrivateMessageInOrder(msgEl, now);
  
  if (isPrivateScrolledToBottom) {
    scrollPrivateMessagesToBottom(false);
  }

  // Send to server
  try {
    const resp = await postForm({
      mode: 'sendPrivate',
      username: auth.u,
      password: auth.p,
      text,
      reply_to: fakeMessage.reply_to,
      send_to: currentPrivateChatUser
    });

    if (resp.status === 'ok' && resp.id) {
      const pendingEl = privateMessagesDiv.querySelector(`.msg[data-msg-id="${tempId}"]`);
      if (pendingEl) {
        pendingEl.dataset.msgId = resp.id;
        updatePrivateMessageStatus(pendingEl, "delivered");
      }
      PENDING_PRIVATE_MESSAGES.delete(tempId);
    } else {
      const pendingEl = privateMessagesDiv.querySelector(`.msg[data-msg-id="${tempId}"]`);
      if (pendingEl) {
        pendingEl.classList.add("failed");
      }
      alert(resp.message || 'Failed to send message');
    }
  } catch (err) {
    console.error('Send private message error:', err);
    const pendingEl = privateMessagesDiv.querySelector(`.msg[data-msg-id="${tempId}"]`);
    if (pendingEl) {
      pendingEl.classList.add("failed");
    }
    alert('Failed to send message');
  }

  clearPrivateReplyTarget();
}

// Send private image
export function sendPrivateImage(fileData, fileName, fileType) {
  const auth = loadAuth();
  if (!auth) {
    alert("Not logged in");
    return false;
  }

  // Create optimistic (pending) image message
  const tempId = "temp-private-img-" + Date.now();
  const now = Date.now();
  const fakeMessage = {
    id: tempId,
    ts: now,
    username: auth.u,
    text: "IMAGE::uploading...",
    optimistic: true,
    reply_to: privateReplyTarget ? privateReplyTarget.id : '',
    reply_preview: privateReplyTarget ? {
      id: privateReplyTarget.id,
      username: privateReplyTarget.username,
      text: privateReplyTarget.text
    } : null
  };

  PENDING_PRIVATE_MESSAGES.set(tempId, {
    text: "IMAGE::" + fileName,
    username: auth.u,
    ts: now,
    reply_to: fakeMessage.reply_to,
    reply_preview: fakeMessage.reply_preview,
    isImage: true,
    fileName: fileName,
    fileType: fileType
  });

  const msgEl = createPrivateMessageElement(fakeMessage, "sent");
  insertPrivateMessageInOrder(msgEl, now);
  scrollPrivateMessagesToBottom(false);

  // Send to server
  postForm({
    mode: 'uploadPrivateImage',
    username: auth.u,
    password: auth.p,
    file: fileData,
    name: fileName,
    type: fileType,
    reply_to: privateReplyTarget ? privateReplyTarget.id : '',
    send_to: currentPrivateChatUser
  })
    .then(resp => {
      if (resp.status === 'ok' && resp.id) {
        const pendingEl = privateMessagesDiv.querySelector(`.msg[data-msg-id="${tempId}"]`);
        if (pendingEl) {
          pendingEl.dataset.msgId = resp.id;
          updatePrivateMessageStatus(pendingEl, "delivered");
          
          const uploadingEl = pendingEl.querySelector('.msg-uploading');
          if (uploadingEl) {
            uploadingEl.remove();
          }
          
          if (resp.imageUrl) {
            let imgUrl = resp.imageUrl;
            const match = imgUrl.match(/\/d\/([a-zA-Z0-9_-]+)(\/|$)/);
            if (match) imgUrl = `https://drive.google.com/thumbnail?id=${match[1]}`;
            
            const imgEl = document.createElement('img');
            imgEl.src = imgUrl;
            imgEl.className = 'msg-image';
            imgEl.alt = fileName;
            imgEl.addEventListener('click', () => window.open(imgUrl, '_blank'));
            imgEl.addEventListener('load', () => {
              if (isPrivateScrolledToBottom) scrollPrivateMessagesToBottom(true);
            });
            
            pendingEl.appendChild(imgEl);
          }
          
          pendingEl.dataset.originalText = "IMAGE::" + resp.imageUrl;
        }
        PENDING_PRIVATE_MESSAGES.delete(tempId);
      } else {
        msgEl.classList.add("failed");
        alert(resp.message || 'Failed to upload image');
      }
    })
    .catch(err => {
      console.error('Private image upload error:', err);
      msgEl.classList.add("failed");
      alert('Failed to upload image');
    });

  clearPrivateReplyTarget();
  return true;
}

// Refresh private messages
export async function refreshPrivateMessages(firstLoad = false) {
  if (!currentPrivateChatUser) return;

  try {
    const auth = loadAuth();
    const data = await getMessages(auth.u);

    if (data.status === 'ok') {
      checkPrivateScrollPosition();
      const wasNearBottom = isPrivateScrolledToBottom;
      const oldLastMsg = privateMessagesDiv.lastElementChild?.dataset.msgId;

      const privateMsgs = (data.messages || []).filter(msg => {
        return (msg.send_to === currentPrivateChatUser && msg.username === auth.u) ||
               (msg.send_to === auth.u && msg.username === currentPrivateChatUser);
      });

      renderPrivateMessages(privateMsgs);

      const newLastMsg = privateMessagesDiv.lastElementChild?.dataset.msgId;

      if (firstLoad) {
        scrollPrivateMessagesToBottom(true);
      } else if (newLastMsg && newLastMsg !== oldLastMsg) {
        if (wasNearBottom) {
          scrollPrivateMessagesToBottom(false);
        } else {
          showNewPrivateMessageNotification();
        }
      }
    }
  } catch (e) {
    console.error('Failed to refresh private messages:', e);
  }
}

// Render private messages
function renderPrivateMessages(messages) {
  if (!privateMessagesDiv) return;

  messages.forEach(m => {
    if (!m || !m.ts || !m.id) return;

    let existingMsg = privateMessagesDiv.querySelector(`.msg[data-msg-id="${m.id}"]`);
    let matchedPending = false;

    if (existingMsg) {
      updateExistingPrivateMessage(existingMsg, m);
      matchedPending = true;
    } else {
      for (let [tempId, pending] of PENDING_PRIVATE_MESSAGES.entries()) {
        const sameUser = pending.username === m.username;
        const timeClose = Math.abs(pending.ts - m.ts) < 10000;
        const sameParent = (pending.reply_to || '') === (m.reply_to || '');

        let isMatch = false;
        if (m.text?.startsWith("STICKER::") && pending.text?.startsWith("STICKER::")) {
          isMatch = sameUser && timeClose && (pending.text === m.text);
        } else if (m.text?.startsWith("IMAGE::") && pending.isImage) {
          isMatch = sameUser && timeClose;
        } else {
          isMatch = sameUser && timeClose && (pending.text === m.text);
        }

        if (isMatch && sameParent) {
          const pendingEl = privateMessagesDiv.querySelector(`.msg[data-msg-id="${tempId}"]`);
          if (pendingEl) {
            pendingEl.dataset.msgId = m.id;
            pendingEl.dataset.ts = String(m.ts);
            pendingEl.dataset.originalText = m.text || '';
            updateExistingPrivateMessage(pendingEl, m);
            updatePrivateMessageStatus(pendingEl, "delivered");
          }
          PENDING_PRIVATE_MESSAGES.delete(tempId);
          matchedPending = true;
          break;
        }
      }
    }

    if (!matchedPending && !existingMsg) {
      const msgEl = createPrivateMessageElement(m, "delivered");
      msgEl.classList.add("float-in");
      insertPrivateMessageInOrder(msgEl, m.ts);
    }
  });

  removeDeletedPrivateMessages(messages);
}

function updateExistingPrivateMessage(element, message) {
  const auth = loadAuth();
  if (message.username === auth.u) element.classList.add('mine');
  else element.classList.remove('mine');

  if (message.reply_to) element.classList.add('has-reply');
  else element.classList.remove('has-reply');

  let replyEl = element.querySelector('.msg-reply');
  if (message.reply_preview && message.reply_preview.username && message.reply_preview.text) {
    if (!replyEl) {
      replyEl = document.createElement('div');
      replyEl.className = 'msg-reply';
      element.insertBefore(replyEl, element.querySelector('.msg-meta')?.nextSibling || element.firstChild);
    }
    replyEl.innerHTML = `<b>${message.reply_preview.username}:</b> ${message.reply_preview.text}`;
  } else if (replyEl) {
    replyEl.remove();
  }

  const currentTs = parseInt(element.dataset.ts, 10) || 0;
  if (Math.abs(currentTs - message.ts) > 1000) {
    let timeEl = element.querySelector('.msg-time');
    if (!timeEl) {
      timeEl = document.createElement('span');
      timeEl.className = 'msg-time';
      const metaEl = element.querySelector('.msg-meta');
      if (metaEl) {
        metaEl.appendChild(timeEl);
      }
    }
    timeEl.textContent = formatTime(message.ts);
    timeEl.title = new Date(message.ts).toLocaleString();
  }

  if (message.username === auth.u) {
    let ticksEl = element.querySelector('.msg-ticks');
    if (!ticksEl) {
      ticksEl = document.createElement('span');
      ticksEl.className = 'msg-ticks';
      const metaEl = element.querySelector('.msg-meta');
      if (metaEl) {
        metaEl.appendChild(ticksEl);
      }
    }
    ticksEl.textContent = " ✓✓";
  } else {
    const ticksEl = element.querySelector('.msg-ticks');
    if (ticksEl) {
      ticksEl.remove();
    }
  }

  let nameEl = element.querySelector('.username');
  if (!nameEl) {
    nameEl = document.createElement('span');
    nameEl.className = 'username';
    nameEl.style.cursor = 'pointer';
    nameEl.addEventListener('click', () =>
      window.dispatchEvent(new CustomEvent('openUserProfile', { detail: message.username }))
    );
    const metaEl = element.querySelector('.msg-meta');
    if (metaEl) {
      metaEl.appendChild(nameEl);
    }
  }
  nameEl.textContent = message.username;

  const isSticker = message.text && message.text.startsWith("STICKER::");
  if (!isSticker) {
    element.ondblclick = () => {
      let replyText = message.text;
      if (message.text?.startsWith("IMAGE::")) {
        replyText = "[image]";
      } else if (message.text?.startsWith("STICKER::")) {
        replyText = "[sticker]";
      }

      setPrivateReplyTarget({
        id: message.id,
        username: message.username,
        text: replyText
      });
    };
  } else {
    element.ondblclick = null;
  }

  element.dataset.msgId = message.id;
  element.dataset.ts = String(message.ts);
}

function createPrivateMessageElement(message, status = null) {
  const auth = loadAuth();
  const msgEl = document.createElement('div');
  msgEl.className = 'msg';
  msgEl.dataset.msgId = message.id;
  msgEl.dataset.ts = String(message.ts || Date.now());
  msgEl.dataset.originalText = message.text || '';
  
  if (message.username === auth.u) msgEl.classList.add('mine');
  if (message.reply_to) msgEl.classList.add('has-reply');

  if (message.reply_preview && message.reply_preview.username && message.reply_preview.text) {
    const replyEl = document.createElement('div');
    replyEl.className = 'msg-reply';
    replyEl.innerHTML = `<b>${message.reply_preview.username}:</b> ${message.reply_preview.text}`;
    msgEl.appendChild(replyEl);
  }

  const metaEl = document.createElement('div');
  metaEl.className = 'msg-meta';

  const nameEl = document.createElement('span');
  nameEl.className = 'username';
  nameEl.textContent = message.username;
  nameEl.style.cursor = 'pointer';
  nameEl.addEventListener('click', () =>
    window.dispatchEvent(new CustomEvent('openUserProfile', { detail: message.username }))
  );

  const timeEl = document.createElement('span');
  timeEl.className = 'msg-time';
  timeEl.textContent = formatTime(message.ts);
  timeEl.title = new Date(message.ts).toLocaleString();

  metaEl.appendChild(nameEl);
  metaEl.appendChild(timeEl);
  msgEl.appendChild(metaEl);

  const isSticker = message.text && message.text.startsWith("STICKER::");
  const isImage = message.text && message.text.startsWith("IMAGE::");
  
  if (isSticker) {
    let stickerUrl = message.text.replace("STICKER::", "");
    if (stickerUrl.includes('drive.google.com/file/d/')) {
      const match = stickerUrl.match(/\/d\/([a-zA-Z0-9_-]+)(\/|$)/);
      if (match) {
        stickerUrl = `https://drive.google.com/thumbnail?id=${match[1]}&sz=w200`;
      }
    }
    
    const stickerEl = document.createElement('img');
    stickerEl.className = 'msg-sticker';
    stickerEl.src = stickerUrl;
    stickerEl.alt = "sticker";
    stickerEl.style.maxWidth = '150px';
    stickerEl.style.maxHeight = '150px';
    stickerEl.style.cursor = 'pointer';
    stickerEl.onload = function() {
      if (isPrivateScrolledToBottom) {
        scrollPrivateMessagesToBottom(true);
      }
    };
    stickerEl.onerror = function() {
      const originalUrl = message.text.replace("STICKER::", "");
      if (stickerUrl !== originalUrl) {
        stickerEl.src = originalUrl;
      }
    };
    
    msgEl.appendChild(stickerEl);
    
  } else if (isImage) {
    let imgUrl = message.text.replace("IMAGE::", "");
    if (imgUrl === "uploading...") {
      const uploadingEl = document.createElement('div');
      uploadingEl.className = 'msg-text msg-uploading';
      uploadingEl.textContent = "Uploading image...";
      uploadingEl.style.fontStyle = 'italic';
      uploadingEl.style.color = '#999';
      msgEl.appendChild(uploadingEl);
    } else {
      const match = imgUrl.match(/\/d\/([a-zA-Z0-9_-]+)(\/|$)/);
      if (match) imgUrl = `https://drive.google.com/thumbnail?id=${match[1]}`;

      const imgEl = document.createElement('img');
      imgEl.src = imgUrl;
      imgEl.className = 'msg-image';
      imgEl.alt = "image";
      imgEl.addEventListener('click', () => window.open(imgUrl, '_blank'));
      imgEl.addEventListener('load', () => {
        if (isPrivateScrolledToBottom) scrollPrivateMessagesToBottom(true);
      });
      
      msgEl.appendChild(imgEl);
    }
  } else {
    const textEl = document.createElement('div');
    textEl.className = 'msg-text';
    textEl.innerHTML = linkifyText(message.text);
    msgEl.appendChild(textEl);
  }

  if (message.username === auth.u) {
    const ticksEl = document.createElement('span');
    ticksEl.className = 'msg-ticks';
    if (status === "sent") ticksEl.textContent = " ✓";
    if (status === "delivered") ticksEl.textContent = " ✓✓";
    metaEl.appendChild(ticksEl);
  }

  if (!isSticker) {
    msgEl.addEventListener('dblclick', () => {
      let replyText = message.text;
      if (isImage) {
        replyText = "[image]";
      } else if (isSticker) {
        replyText = "[sticker]";
      }

      setPrivateReplyTarget({
        id: message.id,
        username: message.username,
        text: replyText
      });
    });
  }

  return msgEl;
}

/* ========================================================================== */
/* Private Message Reply Functions                                            */
/* ========================================================================== */
function setPrivateReplyTarget(msg) {
  privateReplyTarget = msg;

  if (privateReplyPreviewDiv) {
    let previewContent = msg.text;

    if (msg.text?.startsWith("IMAGE::")) {
      previewContent = "[image]";
    } else if (msg.text?.startsWith("STICKER::")) {
      const stickerUrl = msg.text.replace("STICKER::", "");
      previewContent = `<img src="${stickerUrl}" class="reply-sticker-thumb" style="height:40px;vertical-align:middle;">`;
    }

    // ADD type="button" to prevent any form submission behavior
    privateReplyPreviewDiv.innerHTML = `
      Replying to <b>${msg.username}</b>: ${previewContent}
      <button type="button" id="cancelPrivateReplyBtn">✕</button>
    `;
    privateReplyPreviewDiv.style.display = 'block';

    privateReplyPreviewDiv.classList.remove("animate");
    void privateReplyPreviewDiv.offsetWidth;
    privateReplyPreviewDiv.classList.add("animate");

    const cancelBtn = document.getElementById('cancelPrivateReplyBtn');
    if (cancelBtn) {
      cancelBtn.onclick = clearPrivateReplyTarget;
    }
  }
}

function clearPrivateReplyTarget() {
  privateReplyTarget = null;
  
  if (privateReplyPreviewDiv) {
    privateReplyPreviewDiv.classList.remove("animate");
    privateReplyPreviewDiv.classList.add("disappear");
    
    // Clear the animationend event listener first to avoid duplicates
    privateReplyPreviewDiv.onanimationend = null;
    
    privateReplyPreviewDiv.addEventListener("animationend", function handler() {
      privateReplyPreviewDiv.innerHTML = '';
      privateReplyPreviewDiv.style.display = 'none';
      privateReplyPreviewDiv.classList.remove("disappear");
      // Remove the event listener after use
      privateReplyPreviewDiv.removeEventListener("animationend", handler);
    }, { once: true });
  }
}

// DOM helpers
function updatePrivateMessageStatus(el, newStatus) {
  const ticksEl = el.querySelector('.msg-ticks');
  if (!ticksEl) return;
  if (newStatus === "sent") ticksEl.textContent = " ✓";
  if (newStatus === "delivered") ticksEl.textContent = " ✓✓";
}

function insertPrivateMessageInOrder(newElement, timestamp) {
  const allMessages = Array.from(privateMessagesDiv.querySelectorAll('.msg'));
  let inserted = false;

  for (let i = 0; i < allMessages.length; i++) {
    const existingTs = parseInt(allMessages[i].dataset.ts, 10) || 0;
    if (timestamp < existingTs) {
      privateMessagesDiv.insertBefore(newElement, allMessages[i]);
      inserted = true;
      break;
    }
  }

  if (!inserted) {
    privateMessagesDiv.appendChild(newElement);
  }
}

function removeDeletedPrivateMessages(currentMessages) {
  const existingMessages = privateMessagesDiv.querySelectorAll('.msg');
  const currentIds = new Set((currentMessages || []).map(m => m.id?.toString()).filter(Boolean));

  existingMessages.forEach(el => {
    const msgId = el.dataset.msgId;
    if (msgId && !msgId.startsWith("temp") && !currentIds.has(msgId)) {
      el.remove();
    }
  });
}

// Scroll UI
function scrollPrivateMessagesToBottom(instant = false) {
  if (!privateMessagesDiv) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const lastMsg = privateMessagesDiv.lastElementChild;
      if (lastMsg) {
        lastMsg.scrollIntoView({
          block: "nearest",
          behavior: instant ? "auto" : "smooth"
        });
        isPrivateScrolledToBottom = true;

        lastMsg.querySelectorAll("img").forEach(img => {
          if (!img.complete) {
            img.addEventListener("load", () => {
              lastMsg.scrollIntoView({ block: "nearest" });
            }, { once: true });
          }
        });
      }
    });
  });
}

function checkPrivateScrollPosition() {
  if (!privateMessagesDiv) return;
  const scrollPos = privateMessagesDiv.scrollTop;
  const scrollHeight = privateMessagesDiv.scrollHeight;
  const clientHeight = privateMessagesDiv.clientHeight;
  isPrivateScrolledToBottom = (scrollHeight - scrollPos - clientHeight) < 50;
  if (privateScrollBottomBtn) {
    privateScrollBottomBtn.classList.toggle('show', !isPrivateScrolledToBottom);
  }
}

function showNewPrivateMessageNotification() {
  if (notificationSound) {
    notificationSound.currentTime = 0;
    notificationSound.play().catch(() => {});
  }
  if (privateScrollBottomBtn) {
    privateScrollBottomBtn.classList.add("highlight");
    setTimeout(() => privateScrollBottomBtn.classList.remove("highlight"), 2000);
  }
}

// Private message polling
export function startPrivatePolling() {
  stopPrivatePolling();
  refreshPrivateMessages();
  privatePollTimer = setInterval(refreshPrivateMessages, 3000);
}

export function stopPrivatePolling() {
  if (privatePollTimer) clearInterval(privatePollTimer);
  privatePollTimer = null;
}

// Delete private message
export async function deletePrivateMessage(messageId) {
  const auth = loadAuth();
  if (!auth) {
    alert("Not logged in");
    return false;
  }

  if (!confirm("Are you sure you want to delete this message?")) {
    return false;
  }

  try {
    const messageEl = privateMessagesDiv.querySelector(`.msg[data-msg-id="${messageId}"]`);
    if (messageEl) {
      messageEl.style.opacity = '0.5';
      messageEl.style.pointerEvents = 'none';
    }

    const response = await postForm({
      mode: 'deletePrivate',
      username: auth.u,
      password: auth.p,
      message_id: messageId
    });

    if (response.status === 'ok') {
      if (messageEl) {
        messageEl.remove();
      }
      return true;
    } else {
      alert(response.message || 'Failed to delete message');
      if (messageEl) {
        messageEl.style.opacity = '1';
        messageEl.style.pointerEvents = 'auto';
      }
      return false;
    }
  } catch (err) {
    console.error('Delete private message error:', err);
    alert('Failed to delete message');
    const messageEl = privateMessagesDiv.querySelector(`.msg[data-msg-id="${messageId}"]`);
    if (messageEl) {
      messageEl.style.opacity = '1';
      messageEl.style.pointerEvents = 'auto';
    }
    return false;
  }
}