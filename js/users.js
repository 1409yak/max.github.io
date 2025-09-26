import { postForm } from './api.js';
import { ONLINE_THRESHOLD, USERS_REFRESH_MS, HEARTBEAT_MS } from './config.js';
import { loadAuth } from './auth.js';

let usersRefreshTimer = null;
let heartbeatTimer = null;
let currentUser = null;

const usersListEl = document.createElement('ul');
usersListEl.id = 'usersList';

export function setCurrentUser(u) { currentUser = u; }

async function fetchUsers() {
  try {
    const resp = await postForm({ mode: 'getAllProfiles' });
    if (resp.status === 'ok' && Array.isArray(resp.profiles)) {
      // Sort by coins (highest first) by default
      renderUsers(resp.profiles, 'coins');
      
      // Update state and trigger profile preloading
      window.appLoadingState.usersLoaded = true;
      if (window.appLoadingState.messagesLoaded && !window.appLoadingState.profilesPreloaded) {
        setTimeout(() => {
          import('./main.js').then(module => {
            if (module.triggerProfilePreload) {
              module.triggerProfilePreload();
            }
          });
        }, 1000);
      }
    }
  } catch (err) {
    console.error('Failed to fetch users:', err);
  }
}

function renderUsers(users, sortBy = 'coins') {
  usersListEl.innerHTML = '';
  const now = Date.now();
  
  // Sort users based on the selected criteria
  let sortedUsers = [...users];
  
  switch (sortBy) {
    case 'online':
      sortedUsers.sort((a, b) => {
        const aOnline = a.last_active && (now - new Date(a.last_active).getTime() < ONLINE_THRESHOLD);
        const bOnline = b.last_active && (now - new Date(b.last_active).getTime() < ONLINE_THRESHOLD);
        if (aOnline !== bOnline) return aOnline ? -1 : 1;
        return a.username.localeCompare(b.username);
      });
      break;
    case 'name':
      sortedUsers.sort((a, b) => a.username.localeCompare(b.username));
      break;
    case 'coins':
    default:
      // Sort by coins (highest first), then by username
      sortedUsers.sort((a, b) => {
        const balanceA = a.balance || 0;
        const balanceB = b.balance || 0;
        if (balanceB !== balanceA) return balanceB - balanceA;
        return a.username.localeCompare(b.username);
      });
      break;
  }

  sortedUsers.forEach(user => {
    const li = document.createElement('li');
    li.textContent = user.username + (user.username === currentUser ? ' (you)' : '');
    li.classList.add('user-item');
    li.addEventListener('click', () => 
      window.dispatchEvent(new CustomEvent('openUserProfile', { detail: user.username }))
    );

    const isOnline = user.last_active && (now - new Date(user.last_active).getTime() < ONLINE_THRESHOLD);
    li.classList.add(isOnline ? 'online' : 'offline');

    // Add balance info with coin formatting
    if (user.balance !== undefined) {
      const balanceSpan = document.createElement('span');
      balanceSpan.className = 'user-balance';
      balanceSpan.textContent = `${(user.balance || 0).toLocaleString()} coins`;
      balanceSpan.title = `${user.username}'s balance`;
      li.appendChild(balanceSpan);
    }

    usersListEl.appendChild(li);
  });
}

export function startUsersRefresh() {
  stopUsersRefresh();
  fetchUsers();
  usersRefreshTimer = setInterval(fetchUsers, USERS_REFRESH_MS);
}
export function stopUsersRefresh() {
  if (usersRefreshTimer) clearInterval(usersRefreshTimer);
}

async function sendHeartbeat() {
  const auth = loadAuth();
  if (!auth) return;
  try { await postForm({ mode: 'heartbeat', username: auth.u, password: auth.p }); } catch {}
}

export function startHeartbeat() {
  stopHeartbeat();
  sendHeartbeat();
  heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_MS);
}
export function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
}

(function injectSidebar() {
  const aside = document.createElement('aside');
  aside.className = 'users-sidebar';

  // Create close button with SVG icon
  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-sidebar';
  closeBtn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
    </svg>
  `;
  aside.appendChild(closeBtn);

  // Title
  const heading = document.createElement('h2');
  heading.textContent = 'Registered Users';
  aside.appendChild(heading);


  // User list
  aside.appendChild(usersListEl);

  document.body.appendChild(aside);

  // Close event
  closeBtn.addEventListener('click', () => {
    aside.classList.remove('open');
  });

  // Toggle button (in topbar)
  const toggleBtn = document.getElementById("toggleUsersBtn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      aside.classList.toggle("open");
    });
  }

  // Handle window resize to manage close button visibility
  function handleResize() {
    if (window.innerWidth > 768) {
      // Desktop - hide close button and ensure sidebar is open
      closeBtn.style.display = 'none';
      aside.classList.add('open');
    } else {
      // Mobile - show close button when sidebar is open
      closeBtn.style.display = aside.classList.contains('open') ? 'flex' : 'none';
    }
  }

  // Initial setup
  handleResize();
  
  // Add resize listener
  window.addEventListener('resize', handleResize);

  // Additional click outside to close on mobile
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && 
        !toggleBtn.contains(e.target) && 
        e.target !== toggleBtn && 
        aside.classList.contains('open')) {
      aside.classList.remove('open');
    }
  });
})();