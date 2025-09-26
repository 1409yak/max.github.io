import { postForm } from './api.js';
import { loadAuth } from './auth.js';
import { openProfilePictureSelector } from './profile-pictures.js';

// --- DOM Elements ---
const profileModal = document.getElementById('profileModal');
const profileUsername = document.getElementById('profileUsername');
const profileBio = document.getElementById('profileBio');
const profileBalance = document.getElementById('profileBalance');
const saveBio = document.getElementById('saveBio');
const closeProfile = document.getElementById('closeProfile');
const changeProfilePicture = document.getElementById('changeProfilePicture');
const profilePicture = document.getElementById('profilePicture');

const viewProfileModal = document.getElementById('viewProfileModal');
const viewProfileUsername = document.getElementById('viewProfileUsername');
const viewProfileCreated = document.getElementById('viewProfileCreated');
const viewProfileBio = document.getElementById('viewProfileBio');
const viewProfileBalance = document.getElementById('viewProfileBalance');
const closeViewProfile = document.getElementById('closeViewProfile');
const viewProfilePicture = document.getElementById('viewProfilePicture');

// Track current viewed profile and modal state
let currentViewedProfile = null;
let isViewProfileModalOpen = false;

let isPreloading = false;
let preloadPromise = null;

// --- Memory Cache for Instant Loading ---
const PROFILE_PICTURE_CACHE = new Map();

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

// --- Optimized Preload all profiles ---
export async function preloadProfiles() {
  if (isPreloading) return preloadPromise;
  if (window.appLoadingState?.profilesPreloaded) return Promise.resolve();
  
  isPreloading = true;
  console.log('Starting profile preloading...');
  
  preloadPromise = new Promise(async (resolve) => {
    try {
      const resp = await postForm({ mode: 'getAllProfiles' });
      if (resp.status === 'ok' && Array.isArray(resp.profiles)) {
        const cache = {};
        const totalProfiles = resp.profiles.length;
        let loadedCount = 0;
        
        // Process profiles in batches
        const BATCH_SIZE = 20;
        for (let i = 0; i < totalProfiles; i += BATCH_SIZE) {
          const batch = resp.profiles.slice(i, i + BATCH_SIZE);
          for (const p of batch) {
            cache[p.username] = {
              ...p,
              balance: p.balance || 0,
              profile_picture: p.profile_picture || '001.png'
            };
            loadedCount++;
            
            if (loadedCount % 10 === 0) {
              console.log(`Preloaded ${loadedCount}/${totalProfiles} profiles`);
              await new Promise(resolve => setTimeout(resolve, 0));
            }
          }
        }
        
        saveProfileCache(cache);
        console.log(`Successfully preloaded ${totalProfiles} profiles`);
        
        // Preload profile pictures for active users
        await preloadActiveUserPictures(resp.profiles);
      }
      resolve();
    } catch (err) {
      console.error('Failed to preload profiles:', err);
      resolve();
    } finally {
      isPreloading = false;
      window.appLoadingState.profilesPreloaded = true;
    }
  });
  
  return preloadPromise;
}

// --- Enhanced Preload pictures for active users ---
async function preloadActiveUserPictures(profiles) {
  const now = Date.now();
  const ONLINE_THRESHOLD = 5 * 60 * 1000;
  
  const activeUsers = profiles.filter(p => {
    if (!p.last_active) return false;
    const lastActiveTime = new Date(p.last_active).getTime();
    return (now - lastActiveTime) < ONLINE_THRESHOLD;
  });
  
  console.log(`Preloading pictures for ${activeUsers.length} active users`);
  
  const preloadPromises = activeUsers.map(user => {
    return new Promise((resolve) => {
      const pictureName = user.profile_picture || '001.png';
      const pictureUrl = `../profiles/${pictureName}`;
      
      if (PROFILE_PICTURE_CACHE.has(pictureUrl)) {
        resolve();
        return;
      }
      
      const img = new Image();
      img.onload = () => {
        PROFILE_PICTURE_CACHE.set(pictureUrl, {
          url: pictureUrl,
          element: img,
          loaded: true,
          timestamp: Date.now()
        });
        resolve();
      };
      
      img.onerror = () => {
        PROFILE_PICTURE_CACHE.set(pictureUrl, {
          url: pictureUrl,
          loaded: false,
          error: true,
          timestamp: Date.now()
        });
        resolve();
      };
      
      img.src = pictureUrl;
    });
  });
  
  await Promise.all(preloadPromises);
  console.log('Active user pictures preloaded');
}

// --- Preload all profile pictures in background ---
export async function preloadAllProfilePictures() {
  try {
    const cache = loadProfileCache();
    const pictureUrls = new Set();
    
    Object.values(cache).forEach(user => {
      const pictureName = user.profile_picture || '001.png';
      pictureUrls.add(`../profiles/${pictureName}`);
    });
    
    console.log(`Preloading ${pictureUrls.size} unique profile pictures`);
    
    const preloadPromises = Array.from(pictureUrls).map(url => {
      return new Promise((resolve) => {
        if (PROFILE_PICTURE_CACHE.has(url)) {
          resolve();
          return;
        }
        
        const img = new Image();
        img.onload = () => {
          PROFILE_PICTURE_CACHE.set(url, {
            url: url,
            element: img,
            loaded: true,
            timestamp: Date.now()
          });
          resolve();
        };
        
        img.onerror = () => {
          PROFILE_PICTURE_CACHE.set(url, {
            url: url,
            loaded: false,
            error: true,
            timestamp: Date.now()
          });
          resolve();
        };
        
        img.src = url;
      });
    });
    
    await Promise.all(preloadPromises);
    console.log('All profile pictures preloaded');
  } catch (error) {
    console.error('Failed to preload all pictures:', error);
  }
}

// --- Instant profile picture loading ---
export async function loadUserProfilePicture(username, imgElement) {
  // Check memory cache first for instant loading
  const cache = loadProfileCache();
  const userData = cache[username];
  
  if (userData?.profile_picture) {
    const pictureUrl = `../profiles/${userData.profile_picture}`;
    const cachedImage = PROFILE_PICTURE_CACHE.get(pictureUrl);
    
    if (cachedImage?.loaded) {
      // Instant load from memory cache
      imgElement.src = cachedImage.element.src;
      imgElement.classList.add('pre-cached');
      imgElement.classList.remove('loading', 'error');
      return;
    }
  }
  
  // Fallback to normal loading
  imgElement.classList.add('loading');
  imgElement.classList.remove('pre-cached', 'error');
  
  try {
    const response = await postForm({
      mode: 'getProfilePicture',
      username: username
    });
    
    if (response.status === 'ok') {
      const pictureName = response.profile_picture || '001.png';
      const pictureUrl = `../profiles/${pictureName}`;
      const cachedImage = PROFILE_PICTURE_CACHE.get(pictureUrl);
      
      if (cachedImage?.loaded) {
        imgElement.src = cachedImage.element.src;
      } else {
        imgElement.src = pictureUrl;
        
        // Pre-cache for next time
        const img = new Image();
        img.src = pictureUrl;
        img.onload = () => {
          PROFILE_PICTURE_CACHE.set(pictureUrl, {
            url: pictureUrl,
            element: img,
            loaded: true,
            timestamp: Date.now()
          });
        };
      }
      
      // Update cache for future use
      if (cache[username]) {
        cache[username].profile_picture = pictureName;
        saveProfileCache(cache);
      }
    }
  } catch (error) {
    console.error('Failed to load profile picture:', error);
    imgElement.src = '../profiles/001.png';
    imgElement.classList.add('error');
  } finally {
    imgElement.classList.remove('loading');
  }
}

// --- Initialize Profile Picture Event Listeners ---
function initProfilePictureHandlers() {
  if (changeProfilePicture) {
    changeProfilePicture.addEventListener('click', () => {
      openProfilePictureSelector();
    });
  }

  const profilePictures = document.querySelectorAll('.user-profile-picture');
  profilePictures.forEach(img => {
    img.addEventListener('error', function() {
      if (isViewProfileModalOpen && this === viewProfilePicture) return;
      this.classList.add('error');
      this.src = '../profiles/001.png';
      setTimeout(() => this.classList.remove('error'), 2000);
    });
    
    img.addEventListener('load', function() {
      this.classList.remove('error', 'loading');
    });
  });

  viewProfileModal.addEventListener('click', (e) => {
    if (e.target === viewProfileModal) {
      closeViewProfileModal();
    }
  });

  // ADD THIS EVENT LISTENER FOR USER PROFILE OPENING
  window.addEventListener('openUserProfile', (event) => {
    if (event.detail && typeof event.detail === 'string') {
      openUserProfile(event.detail);
    }
  });
}

// --- Close view profile modal properly ---
function closeViewProfileModal() {
  isViewProfileModalOpen = false;
  currentViewedProfile = null;
  viewProfileModal.hidden = true;
  
  if (viewProfilePicture) {
    viewProfilePicture.classList.remove('loading');
    viewProfilePicture.src = '../profiles/001.png';
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
  const numBalance = Number(balance) || 0;
  const formatted = numBalance.toLocaleString();
  return `${formatted} coin${numBalance === 1 ? '' : 's'}`;
}

// --- Open other user profile (read-only) ---
export async function openUserProfile(username) {
  console.log('Opening user profile:', username);
  
  if (isViewProfileModalOpen && currentViewedProfile === username) return;
  
  currentViewedProfile = username;
  isViewProfileModalOpen = true;
  
  const cache = loadProfileCache();
  console.log('User data in cache:', cache[username]);

  if (cache[username]) {
    const p = cache[username];
    viewProfileUsername.textContent = p.username;
    viewProfileCreated.textContent = formatDateOnly(p.created_at);
    viewProfileBio.textContent = p.bio || '(no bio)';
    viewProfileBalance.textContent = formatBalance(p.balance);
    
    if (viewProfilePicture && isViewProfileModalOpen) {
      viewProfilePicture.classList.add('loading');
      try {
        await loadUserProfilePicture(username, viewProfilePicture);
      } catch (error) {
        console.error('Failed to load profile picture:', error);
      }
    }
    
    viewProfileModal.hidden = false;
    console.log('View profile modal should be visible now');
  }

  if (!isViewProfileModalOpen) return;

  try {
    const resp = await postForm({ mode: 'getprofile', username });
    if (resp.status === 'ok' && isViewProfileModalOpen && currentViewedProfile === username) {
      const p = resp.profile;
      cache[username] = p;
      saveProfileCache(cache);

      viewProfileCreated.textContent = formatDateOnly(p.created_at);
      viewProfileBio.textContent = p.bio || '(no bio)';
      viewProfileBalance.textContent = formatBalance(p.balance);
      
      if (viewProfilePicture && isViewProfileModalOpen) {
        await loadUserProfilePicture(username, viewProfilePicture);
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

  if (profilePicture) {
    profilePicture.classList.add('loading');
    await loadUserProfilePicture(auth.u, profilePicture);
  }

  try {
    const resp = await postForm({
      mode: 'getprofile',
      username: auth.u
    });
    if (resp.status === 'ok') {
      const p = resp.profile;
      profileBio.value = p.bio || '';
      profileBalance.textContent = formatBalance(p.balance);
      
      if (profilePicture && p.profile_picture) {
        await loadUserProfilePicture(auth.u, profilePicture);
      }
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
closeProfile.addEventListener('click', () => {
  profileModal.hidden = true;
  if (profilePicture) {
    profilePicture.classList.remove('loading');
  }
});

closeViewProfile.addEventListener('click', closeViewProfileModal);

// --- Refresh balance function ---
export async function refreshUserBalance(username) {
  try {
    const resp = await postForm({ mode: 'getprofile', username });
    if (resp.status === 'ok') {
      const p = resp.profile;
      const cache = loadProfileCache();
      cache[username] = { 
        ...(cache[username] || {}), 
        balance: p.balance || 0,
        profile_picture: p.profile_picture || '001.png'
      };
      saveProfileCache(cache);
      
      if (!profileModal.hidden && profileUsername.textContent === username) {
        profileBalance.textContent = formatBalance(p.balance);
        if (profilePicture) {
          await loadUserProfilePicture(username, profilePicture);
        }
      }
      if (isViewProfileModalOpen && currentViewedProfile === username) {
        viewProfileBalance.textContent = formatBalance(p.balance);
        if (viewProfilePicture) {
          await loadUserProfilePicture(username, viewProfilePicture);
        }
      }
      
      return p.balance || 0;
    }
  } catch (err) {
    console.error('Failed to refresh balance:', err);
  }
  return 0;
}

// --- Update profile picture in cache ---
export function updateProfilePictureInCache(username, pictureName) {
  const cache = loadProfileCache();
  if (cache[username]) {
    cache[username].profile_picture = pictureName;
    saveProfileCache(cache);
  }
}

// --- Get profile picture from cache ---
export function getProfilePictureFromCache(username) {
  const cache = loadProfileCache();
  return cache[username]?.profile_picture || '001.png';
}

// --- Cache cleanup to prevent memory leaks ---
function cleanupProfilePictureCache() {
  const now = Date.now();
  const CACHE_MAX_AGE = 30 * 60 * 1000;
  
  for (const [url, cacheEntry] of PROFILE_PICTURE_CACHE.entries()) {
    if (now - cacheEntry.timestamp > CACHE_MAX_AGE) {
      PROFILE_PICTURE_CACHE.delete(url);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupProfilePictureCache, 10 * 60 * 1000);

// --- Initialize the module ---
export function initProfiles() {
  initProfilePictureHandlers();
}

// Initialize on import
initProfiles();