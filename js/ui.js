import { login, register, logout, loadAuth } from './auth.js';
import { sendMessage, sendImage, startPolling, stopPolling, setCurrentUser } from './chat.js';
import { openOwnProfile, openUserProfile } from './profiles.js';
import { startUsersRefresh, stopUsersRefresh, startHeartbeat, stopHeartbeat } from './users.js';
import { initStickers, openStickerShop } from './stickers.js';

// Add extra custom styles (but NOT scroll button here — keep in styles.css)
const style = document.createElement('style');
style.textContent = `
  /* Timestamp styling */
  .msg-time {
    font-size: 0.7rem;
    color: var(--muted);
    margin-left: 8px;
    opacity: 0.7;
    transition: opacity 0.2s ease;
  }

  .msg:hover .msg-time {
    opacity: 1;
  }

  /* Message meta styling */
  .msg-meta {
    display: flex;
    align-items: baseline;
    margin-bottom: 4px;
  }

`;
document.head.appendChild(style);

// DOM Elements
const authCard = document.getElementById('authCard');
const chatUI = document.getElementById('chatUI');
const whoami = document.getElementById('whoami');
const logoutBtn = document.getElementById('logoutBtn');
const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');
const authForm = document.getElementById('authForm');
const authSubmit = document.getElementById('authSubmit');
const authError = document.getElementById('authError');
const usernameEl = document.getElementById('username');
const passwordEl = document.getElementById('password');
const sendForm = document.getElementById('sendForm');
const messageInput = document.getElementById('messageInput');
const profileBtn = document.getElementById('profileBtn');
const attachImageBtn = document.getElementById('attachImageBtn');
const imageUpload = document.getElementById('imageUpload');
const messagesDiv = document.getElementById('messages');
const scrollBottomBtn = document.getElementById('scrollBottomBtn');
const loadingOverlay = document.getElementById('loadingOverlay');

let mode = 'login';

// Initialize UI
export function initUI() {
  setupEventListeners();
  checkAuthState();
  initScrollButton();
  setupMobileKeyboardHandling();
  initStickers(); // Add this line
}

function initScrollButton() {
  if (!scrollBottomBtn) {
    console.warn('Scroll button element not found');
    return;
  }

  // Set button icon
  scrollBottomBtn.innerHTML = `
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
    </svg>
  `;

  // Click event
  scrollBottomBtn.addEventListener('click', scrollMessagesToBottom);

  // Initial check
  checkScrollPosition();
}

// Scroll to bottom function
function scrollMessagesToBottom() {
  if (messagesDiv) {
    messagesDiv.scrollTo({
      top: messagesDiv.scrollHeight,
      behavior: "smooth"   // smooth scroll instead of instant
    });
  }
  checkScrollPosition();
}

// Show/hide button depending on scroll position
function checkScrollPosition() {
  if (!messagesDiv) return;
  const atBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop <= messagesDiv.clientHeight + 20;

  if (atBottom) {
    scrollBottomBtn.classList.remove('show');
  } else {
    scrollBottomBtn.classList.add('show');
  }
}

function setupEventListeners() {
  // Auth tabs
  loginTab.addEventListener('click', () => setMode('login'));
  registerTab.addEventListener('click', () => setMode('register'));

  // Auth form
  authForm.addEventListener('submit', handleAuthSubmit);

  // Logout
  logoutBtn.addEventListener('click', handleLogout);

  // Chat
  sendForm.addEventListener('submit', handleSendMessage);
  messageInput.addEventListener('keydown', handleMessageKeydown);

  // Profile
  profileBtn.addEventListener('click', handleProfileClick);

  // Image upload
  attachImageBtn.addEventListener('click', () => imageUpload.click());
  imageUpload.addEventListener('change', handleImageUpload);

  // Scroll events
  messagesDiv?.addEventListener('scroll', checkScrollPosition);

  // User profile events
  window.addEventListener('openUserProfile', (e) => openUserProfile(e.detail));

  // Password toggle
  const togglePassword = document.getElementById('togglePassword');
  if (togglePassword) {
    togglePassword.addEventListener('click', togglePasswordVisibility);
  }

  // Sticker button
  const stickerBtn = document.getElementById('stickerBtn');
  if (stickerBtn) {
    stickerBtn.addEventListener('click', handleStickerButtonClick);
    stickerBtn.title = 'Send Sticker (500 coins)';
  }
}

function checkAuthState() {
  const auth = loadAuth();
  if (auth && auth.u && auth.p) {
    enterChat(auth.u);
  } else {
    leaveChat();
  }
}

function setMode(m) {
  mode = m;
  loginTab.classList.toggle('active', m === 'login');
  registerTab.classList.toggle('active', m === 'register');
  authSubmit.textContent = m === 'login' ? 'Login' : 'Register';
  authError.textContent = '';
}

function handleStickerButtonClick() {
  const auth = loadAuth();
  if (!auth) {
    alert('Please login to send stickers');
    return;
  }
  openStickerShop();
}

// Auth Handlers
async function handleAuthSubmit(e) {
  e.preventDefault();
  authError.textContent = '';

  const username = usernameEl.value.trim();
  const password = passwordEl.value;

  if (!username || !password) {
    authError.textContent = 'Please enter both username and password';
    return;
  }

  // Show loading animation
  showLoading(mode === 'login' ? 'login' : 'register');

  try {
    if (mode === 'register') {
      const result = await register(username, password);
      if (result.status !== 'ok') {
        throw new Error(result.message || 'Registration failed');
      }
    }

    const result = await login(username, password);
    if (result.status === 'ok') {
      enterChat(username);
    } else {
      throw new Error(result.message || 'Login failed');
    }
  } catch (error) {
    authError.textContent = error.message;
  } finally {
    // Always hide loading, whether success or error
    hideLoading();
  }
}

async function handleLogout() {
  await logout();
  leaveChat();
}

// Chat Handlers
async function handleSendMessage(e) {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  const success = await sendMessage(text);
  if (success) {
    messageInput.value = '';
    messageInput.focus();
  }
}

function handleMessageKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendForm.requestSubmit();
  }
}

async function handleImageUpload() {
  const file = imageUpload.files[0];
  if (!file) return;

  try {
    const base64 = await fileToBase64(file);
    const fileData = base64.split(",")[1]; // Get the base64 data part
    await sendImage(fileData, file.name, file.type);
    imageUpload.value = "";
  } catch (error) {
    alert('Failed to upload image: ' + error.message);
  }
}

// Profile Handlers
function handleProfileClick() {
  const auth = loadAuth();
  if (auth?.u) openOwnProfile(auth.u);
}

// Utility Functions
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// Chat State Management
export function enterChat(username) {
  setCurrentUser(username);
  
  whoami.textContent = `Logged in as ${username}`;
  profileBtn.hidden = false;
  logoutBtn.hidden = false;
  authCard.hidden = true;
  chatUI.hidden = false;

  // Enable sticker button
  const stickerBtn = document.getElementById('stickerBtn');
  if (stickerBtn) stickerBtn.hidden = false;

  startPolling();
  startUsersRefresh();
  startHeartbeat();
}

export function leaveChat() {
  stopPolling();
  stopUsersRefresh();
  stopHeartbeat();

  whoami.textContent = '';
  profileBtn.hidden = true;
  logoutBtn.hidden = true;
  authCard.hidden = false;   // Show login form
  chatUI.hidden = true;      // Hide chat interface
  
  // Clear form fields
  clearAuthForm();
}

function clearAuthForm() {
  usernameEl.value = '';
  passwordEl.value = '';
  authError.textContent = '';
}

function togglePasswordVisibility() {
  const passwordInput = document.getElementById('password');
  const toggleButton = document.getElementById('togglePassword');
  
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    toggleButton.textContent = '🙈'; // Hide icon
    toggleButton.title = 'Hide password';
  } else {
    passwordInput.type = 'password';
    toggleButton.textContent = '👁️'; // Show icon
    toggleButton.title = 'Show password';
  }
}

// Loading functions
export function showLoading(action = 'loading') {
  if (loadingOverlay) {
    loadingOverlay.dataset.action = action;
    loadingOverlay.hidden = false;
    
    // Update the text based on the action
    const loadingText = loadingOverlay.querySelector('p');
    if (loadingText) {
      switch (action) {
        case 'login':
          loadingText.textContent = 'Logging in...';
          break;
        case 'register':
          loadingText.textContent = 'Registering...';
          break;
        default:
          loadingText.textContent = 'Loading...';
      }
    }
    
    // Disable form interactions while loading
    const authForm = document.getElementById('authForm');
    if (authForm) {
      authForm.style.pointerEvents = 'none';
      authForm.style.opacity = '0.7';
    }
  }
}

export function hideLoading() {
  if (loadingOverlay) {
    loadingOverlay.hidden = true;
    
    // Re-enable form interactions
    const authForm = document.getElementById('authForm');
    if (authForm) {
      authForm.style.pointerEvents = 'auto';
      authForm.style.opacity = '1';
    }
  }
}

// Time Formatting
export function formatTime(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isThisYear = date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (isThisYear) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + 
           ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else {
    return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  }
}

// Theme color handling
const themeColor1Input = document.getElementById("themeColor1");
const themeColor2Input = document.getElementById("themeColor2");

function applyThemeColors(c1, c2) {
  document.documentElement.style.setProperty(
    "--glass-backdrop",
    `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`
  );
}

function saveThemeColors() {
  localStorage.setItem("themeColor1", themeColor1Input.value);
  localStorage.setItem("themeColor2", themeColor2Input.value);
}

// Listeners
themeColor1Input?.addEventListener("input", () => {
  applyThemeColors(themeColor1Input.value, themeColor2Input.value);
  saveThemeColors();
});

themeColor2Input?.addEventListener("input", () => {
  applyThemeColors(themeColor1Input.value, themeColor2Input.value);
  saveThemeColors();
});

// Restore saved or defaults
document.addEventListener("DOMContentLoaded", () => {
  const c1 = localStorage.getItem("themeColor1") || "#667eea";
  const c2 = localStorage.getItem("themeColor2") || "#764ba2";

  themeColor1Input.value = c1;
  themeColor2Input.value = c2;

  applyThemeColors(c1, c2);
});

const resetBtn = document.getElementById("resetTheme");

resetBtn.addEventListener("click", () => {
  const default1 = "#667eea";
  const default2 = "#764ba2";

  // Apply defaults
  themeColor1Input.value = default1;
  themeColor2Input.value = default2;
  applyThemeColors(default1, default2);

  // Save back to localStorage
  localStorage.setItem("themeColor1", default1);
  localStorage.setItem("themeColor2", default2);
});



// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initUI);

