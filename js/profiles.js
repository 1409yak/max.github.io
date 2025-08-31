// profiles.js
import { postForm } from './api.js';
import { loadAuth } from './auth.js';

// --- DOM Elements ---
const profileModal = document.getElementById('profileModal');
const profileUsername = document.getElementById('profileUsername');
const profileBio = document.getElementById('profileBio');
const profileBalance = document.getElementById('profileBalance');
const saveBio = document.getElementById('saveBio');
const closeProfile = document.getElementById('closeProfile');

const viewProfileModal = document.getElementById('viewProfileModal');
const viewProfileUsername = document.getElementById('viewProfileUsername');
const viewProfileCreated = document.getElementById('viewProfileCreated');
const viewProfileBio = document.getElementById('viewProfileBio');
const viewProfileBalance = document.getElementById('viewProfileBalance');
const closeViewProfile = document.getElementById('closeViewProfile');

// --- Profile Cache ---
function saveProfileCache(profiles) {
  localStorage.setItem('gm_profiles', JSON.stringify(profiles));
}

function loadProfileCache() {
  try {
    return JSON.parse(localStorage.getItem('gm_profiles') || '{}');
  } catch {
    return {};
  }
}

// --- Preload all profiles ---
export async function preloadProfiles() {
  try {
    const resp = await postForm({ mode: 'getAllProfiles' });
    if (resp.status === 'ok' && Array.isArray(resp.profiles)) {
      const cache = {};
      resp.profiles.forEach(p => { 
        cache[p.username] = {
          ...p,
          balance: p.balance || 0 // Ensure balance exists
        };
      });
      saveProfileCache(cache);
    }
  } catch (err) {
    console.error('Failed to preload profiles:', err);
  }
}

// --- Date formatting ---
export function formatDateOnly(dateStr) {
  if (!dateStr) return '(unknown)';
  const date = new Date(dateStr);
  if (isNaN(date)) return dateStr;
  return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`;
}

// --- Format balance display ---
export function formatBalance(balance) {
  // Convert to number and format with commas
  const numBalance = Number(balance) || 0;
  const formatted = numBalance.toLocaleString();
  return `${formatted} coin${numBalance === 1 ? '' : 's'}`;
}

// --- Open other user profile (read-only) ---
export async function openUserProfile(username) {
  const cache = loadProfileCache();

  // Show cached info immediately
  if (cache[username]) {
    const p = cache[username];
    viewProfileUsername.textContent = p.username;
    viewProfileCreated.textContent = formatDateOnly(p.created_at);
    viewProfileBio.textContent = p.bio || '(no bio)';
    viewProfileBalance.textContent = formatBalance(p.balance);
    viewProfileModal.hidden = false;
  }

  // Fetch latest data from server
  try {
    const resp = await postForm({ mode: 'getprofile', username });
    if (resp.status === 'ok') {
      const p = resp.profile;
      cache[username] = p;
      saveProfileCache(cache);

      if (!viewProfileModal.hidden && viewProfileUsername.textContent === username) {
        viewProfileCreated.textContent = formatDateOnly(p.created_at);
        viewProfileBio.textContent = p.bio || '(no bio)';
        viewProfileBalance.textContent = formatBalance(p.balance);
      }
    }
  } catch (err) {
    console.error('Failed to fetch profile:', err);
  }
}

// --- Open own profile (editable) ---
export async function openOwnProfile() {
  const auth = loadAuth();
  if (!auth) return alert("Not logged in");

  profileUsername.textContent = auth.u;
  profileModal.hidden = false;

  try {
    const resp = await postForm({
      mode: 'getprofile',
      username: auth.u
    });
    if (resp.status === 'ok') {
      const p = resp.profile;
      profileBio.value = p.bio || '';
      profileBalance.textContent = formatBalance(p.balance);
    } else {
      profileBio.value = '';
      profileBalance.textContent = formatBalance(0);
    }
  } catch (err) {
    console.error('Failed to fetch own profile:', err);
    profileBio.value = '';
    profileBalance.textContent = formatBalance(0);
  }
}

// --- Save own bio ---
saveBio.addEventListener('click', async () => {
  const auth = loadAuth();
  if (!auth) return alert("Not logged in");

  const bio = profileBio.value;

  try {
    const resp = await postForm({
      mode: 'saveBio',
      username: auth.u,
      password: auth.p,
      bio
    });

    if (resp.status === 'ok') {
      alert('Bio saved!');
      profileModal.hidden = true;

      // Update cache immediately
      const cache = loadProfileCache();
      cache[auth.u] = { ...(cache[auth.u] || {}), bio };
      saveProfileCache(cache);
    } else {
      alert(resp.message || 'Failed to save bio');
    }
  } catch (err) {
    console.error('Failed to save bio:', err);
    alert('Failed to save bio');
  }
});

// --- Close modals ---
closeProfile.addEventListener('click', () => profileModal.hidden = true);
closeViewProfile.addEventListener('click', () => viewProfileModal.hidden = true);

// --- Refresh balance function ---
export async function refreshUserBalance(username) {
  try {
    const resp = await postForm({ mode: 'getprofile', username });
    if (resp.status === 'ok') {
      const p = resp.profile;
      const cache = loadProfileCache();
      cache[username] = { ...(cache[username] || {}), balance: p.balance || 0 };
      saveProfileCache(cache);
      
      // Update UI if profile is currently open
      if (!profileModal.hidden && profileUsername.textContent === username) {
        profileBalance.textContent = formatBalance(p.balance);
      }
      if (!viewProfileModal.hidden && viewProfileUsername.textContent === username) {
        viewProfileBalance.textContent = formatBalance(p.balance);
      }
      
      return p.balance || 0;
    }
  } catch (err) {
    console.error('Failed to refresh balance:', err);
  }
  return 0;
}