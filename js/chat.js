// chat.js (with robust replies + optimistic merge via id)
// Uses: id (stable identity), ts (timestamp for ordering)

import { postForm, getMessages } from './api.js';
import { loadAuth } from './auth.js';
import { formatTime } from './ui.js';

let pollTimer = null;
let currentUser = null;
let isScrolledToBottom = false;
let replyTarget = null; // { id, username, text }

const messagesDiv = document.getElementById('messages');
const scrollBottomBtn = document.getElementById('scrollBottomBtn');
const replyPreviewDiv = document.getElementById('replyPreview'); // ⚡ add this div near input in HTML

const notificationSound = new Audio("../sounds/notify.mp3");

// tempId -> { ts, text, username, reply_to, reply_preview }
const PENDING_MESSAGES = new Map();

/* ========================================================================== */
/* Auth + lifecycle                                                           */
/* ========================================================================== */
export function setCurrentUser(u) {
  currentUser = u;
}

export function getCurrentUser() {
  return currentUser;
}

export function startPolling() {
  stopPolling();
  refreshMessages(true);
  pollTimer = setInterval(refreshMessages, 3000);
}

export function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

/* ========================================================================== */
/* Networking                                                                 */
/* ========================================================================== */
function linkifyText(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, url => {
    // escape HTML inside URL if needed
    const safeUrl = url.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeUrl}</a>`;
  });
}

export async function refreshMessages(firstLoad = false) {
  try {
    const data = await getMessages();
    if (data.status === 'ok') {
      checkScrollPosition();
      const wasNearBottom = isScrolledToBottom;
      const oldLastMsg = messagesDiv.lastElementChild?.dataset.msgId;

      // Render messages but preserve existing ones to avoid re-animation
      renderMessages(data.messages || [], { preserveExisting: true });

      const newLastMsg = messagesDiv.lastElementChild?.dataset.msgId;

      if (firstLoad) {
        scrollMessagesToBottom(true);
      } else if (newLastMsg && newLastMsg !== oldLastMsg) {
        if (wasNearBottom) {
          scrollMessagesToBottom(false);
        } else {
          showNewMessageNotification();
        }
      }
    }
  } catch (e) {
    console.error('Failed to refresh messages:', e);
  }
}

export function sendMessage(text) {
  if (!text || text.length > 500) {
    alert('Message must be 1–500 characters');
    return false;
  }

  const auth = loadAuth();
  if (!auth) return false;

  // Create optimistic (pending) message
  const tempId = "temp-" + Date.now();
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

  PENDING_MESSAGES.set(tempId, {
    text,
    username: auth.u,
    ts: now,
    reply_to: fakeMessage.reply_to,
    reply_preview: fakeMessage.reply_preview,
    isSticker: text.startsWith("STICKER::"),
    isImage: false
  });

  const msgEl = createMessageElement(fakeMessage, "sent");
  insertMessageInOrder(msgEl, now);
  
  // Only scroll if we're near the bottom
  if (isScrolledToBottom) {
    scrollMessagesToBottom(false);
  }

  // Send to server
  postForm({
    mode: 'send',
    username: auth.u,
    password: auth.p,
    text,
    reply_to: fakeMessage.reply_to
  })
    .then(resp => {
      if (resp.status === 'ok' && resp.id) {
        const pendingEl = messagesDiv.querySelector(`.msg[data-msg-id="${tempId}"]`);
        if (pendingEl) {
          // Reuse the same DOM element
          pendingEl.dataset.msgId = resp.id;
          updateMessageStatus(pendingEl, "delivered");
        }
        // Remove from pending map (renderMessages will keep it alive)
        PENDING_MESSAGES.delete(tempId);
      } else {
        const pendingEl = messagesDiv.querySelector(`.msg[data-msg-id="${tempId}"]`);
        if (pendingEl) {
          pendingEl.classList.add("failed");
        }
        
        // SPECIAL HANDLING FOR MUTE ERROR
        if (resp.message && resp.message.toLowerCase().includes('muted')) {
          alert('You are muted and cannot send messages');
          // Remove the failed message from UI if user is muted
          if (pendingEl) {
            pendingEl.remove();
          }
          PENDING_MESSAGES.delete(tempId);
        } else {
          alert(resp.message || 'Failed to send message');
        }
      }
    })
    .catch(err => {
      console.error('Send message error:', err);
      const pendingEl = messagesDiv.querySelector(`.msg[data-msg-id="${tempId}"]`);
      if (pendingEl) {
        pendingEl.classList.add("failed");
      }
      alert('Failed to send message');
    });

  // Clear reply target AFTER sending the message
  clearReplyTarget();
  return true;
}

export function sendImage(fileData, fileName, fileType) {
  const auth = loadAuth();
  if (!auth) {
    alert("Not logged in");
    return false;
  }

  // Create optimistic (pending) image message
  const tempId = "temp-img-" + Date.now();
  const now = Date.now();
  const fakeMessage = {
    id: tempId,
    ts: now,
    username: auth.u,
    text: "IMAGE::uploading...", // Temporary placeholder
    optimistic: true,
    reply_to: replyTarget ? replyTarget.id : '',
    reply_preview: replyTarget ? {
      id: replyTarget.id,
      username: replyTarget.username,
      text: replyTarget.text
    } : null
  };

  PENDING_MESSAGES.set(tempId, {
    text: "IMAGE::" + fileName, // Store actual file info
    username: auth.u,
    ts: now,
    reply_to: fakeMessage.reply_to,
    reply_preview: fakeMessage.reply_preview,
    isImage: true,
    fileName: fileName,
    fileType: fileType
  });

  // Create and insert optimistic message
  const msgEl = createMessageElement(fakeMessage, "sent");
  insertMessageInOrder(msgEl, now);
  scrollMessagesToBottom(false);

  // Send to server - USE uploadImage MODE, NOT sendimage
  postForm({
    mode: 'uploadImage', // ← CORRECT MODE NAME
    username: auth.u,
    password: auth.p,
    file: fileData,
    name: fileName,
    type: fileType,
    reply_to: replyTarget ? replyTarget.id : ''
  })
    .then(resp => {
      if (resp.status === 'ok' && resp.id) {
        const pendingEl = messagesDiv.querySelector(`.msg[data-msg-id="${tempId}"]`);
        if (pendingEl) {
          pendingEl.dataset.msgId = resp.id;
          updateMessageStatus(pendingEl, "delivered");
          
          // Remove the uploading text and create the actual image element
          const uploadingEl = pendingEl.querySelector('.msg-uploading');
          if (uploadingEl) {
            uploadingEl.remove();
          }
          
          // Create and add the actual image
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
              if (isScrolledToBottom) scrollMessagesToBottom(true);
            });
            
            pendingEl.appendChild(imgEl);
          }
          
          // Update the dataset to reflect the actual image URL
          pendingEl.dataset.originalText = "IMAGE::" + resp.imageUrl;
        }
        PENDING_MESSAGES.delete(tempId);
      } else {
        msgEl.classList.add("failed");
        
        // SPECIAL HANDLING FOR MUTE ERROR
        if (resp.message && resp.message.toLowerCase().includes('muted')) {
          alert('You are muted and cannot send messages');
          // Remove the failed message from UI if user is muted
          msgEl.remove();
          PENDING_MESSAGES.delete(tempId);
        } else {
          alert(resp.message || 'Failed to upload image');
        }
      }
    })
    .catch(err => {
      console.error('Image upload error:', err);
      msgEl.classList.add("failed");
      alert('Failed to upload image');
    });

  clearReplyTarget();
  return true;
}

/* ========================================================================== */
/* Rendering                                                                  */
/* ========================================================================== */
function renderMessages(msgs) {
  if (!messagesDiv) return;

  msgs.forEach(m => {
    if (!m || !m.ts || !m.id) return;

    // 1. Try to find an existing message by real server ID
    let existingMsg = messagesDiv.querySelector(`.msg[data-msg-id="${m.id}"]`);
    let matchedPending = false;

    if (existingMsg) {
      // Already in DOM → just update
      updateExistingMessage(existingMsg, m);
      matchedPending = true;
    } else {
      // 2. Try to match with a pending message
      for (let [tempId, pending] of PENDING_MESSAGES.entries()) {
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
          const pendingEl = messagesDiv.querySelector(`.msg[data-msg-id="${tempId}"]`);
          if (pendingEl) {
            // ✅ Reuse pending element instead of replacing
            pendingEl.dataset.msgId = m.id;
            pendingEl.dataset.ts = String(m.ts);
            pendingEl.dataset.originalText = m.text || '';

            updateExistingMessage(pendingEl, m);
            updateMessageStatus(pendingEl, "delivered");

            if (m.username === currentUser && !pendingEl.querySelector('.msg-delete')) {
              const deleteBtn = document.createElement('button');
              deleteBtn.className = 'msg-delete';
              deleteBtn.innerHTML = '×';
              deleteBtn.title = 'Delete message';
              deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteMessage(m.id);
              });

              const metaEl = pendingEl.querySelector('.msg-meta');
              if (metaEl) {
                metaEl.appendChild(deleteBtn);
              }
            }
          }
          PENDING_MESSAGES.delete(tempId);
          matchedPending = true;
          break;
        }
      }
    }

    // 3. If it’s not pending and not already in DOM → brand new
    if (!matchedPending && !existingMsg) {
      const msgEl = createMessageElement(m, "delivered");
      msgEl.classList.add("float-in"); // animate only real new messages
      insertMessageInOrder(msgEl, m.ts);
    }
  });

  // 4. Use your original cleanup
  removeDeletedMessages(msgs);
}

function updateExistingMessage(element, message) {
  // Don't update the content of existing messages, only update metadata and status
  // This preserves the optimistic message while updating delivery status
  
  // Update message ownership class
  if (message.username === currentUser) element.classList.add('mine');
  else element.classList.remove('mine');

  // Update reply status
  if (message.reply_to) element.classList.add('has-reply');
  else element.classList.remove('has-reply');

  // Update reply preview if it exists
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

  // Update timestamp if it's significantly different (more than 1 second)
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

  // Update message status ticks (only for user's own messages)
  if (message.username === currentUser) {
    let ticksEl = element.querySelector('.msg-ticks');
    if (!ticksEl) {
      ticksEl = document.createElement('span');
      ticksEl.className = 'msg-ticks';
      
      const metaEl = element.querySelector('.msg-meta');
      if (metaEl) {
        metaEl.appendChild(ticksEl);
      }
    }
    ticksEl.textContent = " ✓✓"; // Always show delivered status
  } else {
    // Remove ticks if they exist on other users' messages
    const ticksEl = element.querySelector('.msg-ticks');
    if (ticksEl) {
      ticksEl.remove();
    }
  }

  // Add/update delete button for user's own delivered messages
  if (message.username === currentUser && !message.id.startsWith("temp-")) {
    let deleteBtn = element.querySelector('.msg-delete');
    if (!deleteBtn) {
      deleteBtn = document.createElement('button');
      deleteBtn.className = 'msg-delete';
      deleteBtn.innerHTML = '×';
      deleteBtn.title = 'Delete message';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteMessage(message.id);
      });
      
      const metaEl = element.querySelector('.msg-meta');
      if (metaEl) {
        metaEl.appendChild(deleteBtn);
      }
    }
  } else {
    // Remove delete button if it exists on other users' messages
    const deleteBtn = element.querySelector('.msg-delete');
    if (deleteBtn) {
      deleteBtn.remove();
    }
  }

  // Update username if it's missing or different
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

  // Update double-click handler for replies (skip for stickers)
  const isSticker = message.text && message.text.startsWith("STICKER::");
  if (!isSticker) {
    element.ondblclick = () => {
      let replyText = message.text;

      if (message.text?.startsWith("IMAGE::")) {
        replyText = "[image]";
      } else if (message.text?.startsWith("STICKER::")) {
        replyText = "[sticker]";
      }

      setReplyTarget({
        id: message.id,
        username: message.username,
        text: replyText
      });
    };
  } else {
    element.ondblclick = null;
  }

  // Update dataset attributes
  element.dataset.msgId = message.id;
  element.dataset.ts = String(message.ts);
  
  // Note: We intentionally DON'T update the message content (text, image, sticker)
  // to preserve the optimistic version that the user saw when sending
}

function createMessageElement(message, status = null) {
  const msgEl = document.createElement('div');
  msgEl.className = 'msg';
  msgEl.dataset.msgId = message.id;
  msgEl.dataset.ts = String(message.ts || Date.now());
  // Store the original message text for matching purposes
  msgEl.dataset.originalText = message.text || '';
  
  if (message.username === currentUser) msgEl.classList.add('mine');
  if (message.reply_to) msgEl.classList.add('has-reply');

  // Add reply preview if available
  if (message.reply_preview && message.reply_preview.username && message.reply_preview.text) {
    const replyEl = document.createElement('div');
    replyEl.className = 'msg-reply';
    replyEl.innerHTML = `<b>${message.reply_preview.username}:</b> ${message.reply_preview.text}`;
    msgEl.appendChild(replyEl);
  }

  // Create message metadata (username and time)
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

  // Handle different message types
  const isSticker = message.text && message.text.startsWith("STICKER::");
  const isImage = message.text && message.text.startsWith("IMAGE::");
  
  if (isSticker) {
    // STICKER MESSAGE - No message box, just the sticker
    let stickerUrl = message.text.replace("STICKER::", "");
    
    // Convert Google Drive URL to thumbnail if needed
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
      // Ensure the sticker is visible after loading
      if (isScrolledToBottom) {
        scrollMessagesToBottom(true);
      }
    };
    stickerEl.onerror = function() {
      // Fallback: try to load the original URL if thumbnail fails
      const originalUrl = message.text.replace("STICKER::", "");
      if (stickerUrl !== originalUrl) {
        stickerEl.src = originalUrl;
      }
    };
    
    msgEl.appendChild(stickerEl);
    
  } else if (isImage) {
    // IMAGE MESSAGE - Keep message box with image inside
    let imgUrl = message.text.replace("IMAGE::", "");
    
    // Handle optimistic "uploading..." placeholder
    if (imgUrl === "uploading...") {
      const uploadingEl = document.createElement('div');
      uploadingEl.className = 'msg-text msg-uploading';
      uploadingEl.textContent = "Uploading image...";
      uploadingEl.style.fontStyle = 'italic';
      uploadingEl.style.color = '#999';
      msgEl.appendChild(uploadingEl);
    } else {
      // Process actual image URL
      const match = imgUrl.match(/\/d\/([a-zA-Z0-9_-]+)(\/|$)/);
      if (match) imgUrl = `https://drive.google.com/thumbnail?id=${match[1]}`;

      const imgEl = document.createElement('img');
      imgEl.src = imgUrl;
      imgEl.className = 'msg-image';
      imgEl.alt = "image";
      imgEl.addEventListener('click', () => window.open(imgUrl, '_blank'));
      imgEl.addEventListener('load', () => {
        if (isScrolledToBottom) scrollMessagesToBottom(true);
      });
      
      msgEl.appendChild(imgEl);
    }
  } else {
    // TEXT MESSAGE - Regular message box
    const textEl = document.createElement('div');
    textEl.className = 'msg-text';
    textEl.innerHTML = linkifyText(message.text);
    msgEl.appendChild(textEl);
  }

  // Add message status ticks (only for user's own messages)
  if (message.username === currentUser) {
    const ticksEl = document.createElement('span');
    ticksEl.className = 'msg-ticks';
    if (status === "sent") ticksEl.textContent = " ✓";
    if (status === "delivered") ticksEl.textContent = " ✓✓";
    metaEl.appendChild(ticksEl);
  }

  // Add delete button for user's own delivered messages
  if (message.username === currentUser && status === "delivered" && !message.id.startsWith("temp-")) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'msg-delete';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = 'Delete message';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteMessage(message.id);
    });
    metaEl.appendChild(deleteBtn);
  }

  // Double-click to reply (skip for stickers to avoid accidental replies)
  if (!isSticker) {
    msgEl.addEventListener('dblclick', () => {
      let replyText = message.text;
      if (isImage) {
        replyText = "[image]";
      } else if (isSticker) {
        replyText = "[sticker]";
      }

      setReplyTarget({
        id: message.id,
        username: message.username,
        text: replyText
      });
    });
  }

  return msgEl;
}

/* ========================================================================== */
/* Reply UI                                                                   */
/* ========================================================================== */
function setReplyTarget(msg) {
  replyTarget = msg;

  if (replyPreviewDiv) {
    let previewContent = msg.text;

    // Handle special message types
    if (msg.text?.startsWith("IMAGE::")) {
      previewContent = "[image]";
    } else if (msg.text?.startsWith("STICKER::")) {
      // Extract the actual sticker URL (after "STICKER::")
      const stickerUrl = msg.text.replace("STICKER::", "");
      previewContent = `<img src="${stickerUrl}" class="reply-sticker-thumb" style="height:40px;vertical-align:middle;">`;
    }

    replyPreviewDiv.innerHTML = `
      Replying to <b>${msg.username}</b>: ${previewContent}
      <button id="cancelReplyBtn">✕</button>
    `;
    replyPreviewDiv.style.display = 'block';

    // Restart small CSS animation
    replyPreviewDiv.classList.remove("animate");
    void replyPreviewDiv.offsetWidth;
    replyPreviewDiv.classList.add("animate");

    document.getElementById('cancelReplyBtn').onclick = clearReplyTarget;
  }
}

function clearReplyTarget() {
  // Clear the reply target variable
  replyTarget = null;
  
  // Properly hide the reply preview with animation
  if (replyPreviewDiv) {
    replyPreviewDiv.classList.remove("animate");
    replyPreviewDiv.classList.add("disappear");
    
    // Wait for animation to complete before hiding and clearing
    replyPreviewDiv.addEventListener("animationend", () => {
      replyPreviewDiv.innerHTML = '';
      replyPreviewDiv.style.display = 'none';
      replyPreviewDiv.classList.remove("disappear");
    }, { once: true });
  }
}

/* ========================================================================== */
/* DOM helpers                                                                */
/* ========================================================================== */
function updateMessageStatus(el, newStatus) {
  const ticksEl = el.querySelector('.msg-ticks');
  if (!ticksEl) return;
  if (newStatus === "sent") ticksEl.textContent = " ✓";
  if (newStatus === "delivered") ticksEl.textContent = " ✓✓";
}

function insertMessageInOrder(newElement, timestamp) {
  const allMessages = Array.from(messagesDiv.querySelectorAll('.msg'));
  let inserted = false;

  for (let i = 0; i < allMessages.length; i++) {
    const existingTs = parseInt(allMessages[i].dataset.ts, 10) || 0;
    if (timestamp < existingTs) {
      messagesDiv.insertBefore(newElement, allMessages[i]);
      inserted = true;
      break;
    }
  }

  if (!inserted) {
    messagesDiv.appendChild(newElement);
  }
}

function removeDeletedMessages(currentMessages) {
  const existingMessages = messagesDiv.querySelectorAll('.msg');
  const currentIds = new Set((currentMessages || []).map(m => m.id?.toString()).filter(Boolean));

  existingMessages.forEach(el => {
    const msgId = el.dataset.msgId;
    // Only remove messages that are not pending (temp*)
    if (msgId && !msgId.startsWith("temp") && !currentIds.has(msgId)) {
      el.remove();
    }
  });
}

/* ========================================================================== */
/* Scroll UI                                                                  */
/* ========================================================================== */
export function scrollMessagesToBottom(instant = false) {
  if (!messagesDiv) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const lastMsg = messagesDiv.lastElementChild;
      if (lastMsg) {
        lastMsg.scrollIntoView({
          block: "nearest",   // <— this is the key change
          behavior: instant ? "auto" : "smooth"
        });
        isScrolledToBottom = true;

        // Re-snap if images load later
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

export function checkScrollPosition() {
  if (!messagesDiv) return;
  const scrollPos = messagesDiv.scrollTop;
  const scrollHeight = messagesDiv.scrollHeight;
  const clientHeight = messagesDiv.clientHeight;
  isScrolledToBottom = (scrollHeight - scrollPos - clientHeight) < 50;
  if (scrollBottomBtn) {
    scrollBottomBtn.classList.toggle('show', !isScrolledToBottom);
  }
}

export function updateScrollButtonVisibility() {
  checkScrollPosition();
}

function showNewMessageNotification() {
  if (notificationSound) {
    notificationSound.currentTime = 0;
    notificationSound.play().catch(() => {});
  }
  if (scrollBottomBtn) {
    scrollBottomBtn.classList.add("highlight");
    setTimeout(() => scrollBottomBtn.classList.remove("highlight"), 2000);
  }
}

/* ========================================================================== */
/* Message Deletion                                                           */
/* ========================================================================== */
export async function deleteMessage(messageId) {
  const auth = loadAuth();
  if (!auth) {
    alert("Not logged in");
    return false;
  }

  if (!confirm("Are you sure you want to delete this message?")) {
    return false;
  }

  try {
    // Add visual feedback
    const messageEl = messagesDiv.querySelector(`.msg[data-msg-id="${messageId}"]`);
    if (messageEl) {
      messageEl.style.opacity = '0.5';
      messageEl.style.pointerEvents = 'none';
    }

    // Call the backend to delete the message
    const response = await postForm({
      mode: 'delete',
      username: auth.u,
      password: auth.p,
      message_id: messageId
    });

    if (response.status === 'ok') {
      // Remove the message from the UI
      if (messageEl) {
        messageEl.remove();
      }
      return true;
    } else {
      alert(response.message || 'Failed to delete message');
      // Restore UI if deletion failed
      if (messageEl) {
        messageEl.style.opacity = '1';
        messageEl.style.pointerEvents = 'auto';
      }
      return false;
    }
  } catch (err) {
    console.error('Delete message error:', err);
    alert('Failed to delete message');
    // Restore UI if deletion failed
    const messageEl = messagesDiv.querySelector(`.msg[data-msg-id="${messageId}"]`);
    if (messageEl) {
      messageEl.style.opacity = '1';
      messageEl.style.pointerEvents = 'auto';
    }
    return false;
  }
}

/* ========================================================================== */
/* Listeners                                                                  */
/* ========================================================================== */

if (messagesDiv) {
  messagesDiv.addEventListener('scroll', checkScrollPosition);
}

if (scrollBottomBtn) {
  scrollBottomBtn.addEventListener('click', () => scrollMessagesToBottom(false));
}
