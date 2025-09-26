import { loadAuth } from './auth.js';
import { preloadProfiles, initProfiles } from './profiles.js';
import { enterChat, leaveChat } from './ui.js';
import { initStickers, openStickerShop } from './stickers.js';
import { initBlackjack } from './blackjack.js';
import { initBalanceCache } from './economyCache.js';
import { initPrivateChat, openPrivateChat, closePrivateChat } from './private-chat.js';

// Initialize all modules
initBalanceCache(5000);
initBlackjack();
initPrivateChat();
initProfiles(); // Initialize profiles module

// Global loading state tracker
window.appLoadingState = {
  messagesLoaded: false,
  usersLoaded: false,
  profilesPreloaded: false
};

(function init() {
  const auth = loadAuth();
  if (auth && auth.u && auth.p) {
    enterChat(auth.u);
    
    // Start preloading profiles after a short delay
    setTimeout(() => {
      if (!window.appLoadingState.profilesPreloaded) {
        preloadProfiles().then(() => {
          window.appLoadingState.profilesPreloaded = true;
          console.log('Profiles preloaded successfully');
          
          // Now preload all profile pictures in background
          import('./profiles.js').then(module => {
            if (module.preloadAllProfilePictures) {
              module.preloadAllProfilePictures();
            }
          });
        }).catch(console.error);
      }
    }, 3000);
  } else {
    leaveChat();
  }
})();

// Export function to trigger profile preloading from other modules
export function triggerProfilePreload() {
  if (!window.appLoadingState.profilesPreloaded) {
    preloadProfiles().then(() => {
      window.appLoadingState.profilesPreloaded = true;
      console.log('Profiles preloaded via trigger');
    }).catch(console.error);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initStickers();
  
  // Add message button to user profiles
  window.addEventListener('openUserProfile', (event) => {
    const username = event.detail;
    const viewProfileModal = document.getElementById('viewProfileModal');
    const modalActions = viewProfileModal.querySelector('.modal-actions');

    // Remove ALL existing Message buttons
    modalActions.querySelectorAll('.message-user-btn').forEach(btn => btn.remove());

    // Don't add message button for own profile
    const auth = loadAuth();
    if (auth && auth.u === username) return;

    // Create and add message button
    const messageBtn = document.createElement('button');
    messageBtn.className = 'glass-btn message-user-btn';
    messageBtn.textContent = 'Message';
    messageBtn.onclick = () => {
      openPrivateChat(username);
      document.getElementById('closeViewProfile').click();
    };

    modalActions.insertBefore(messageBtn, modalActions.firstChild);
  });

  // Add this to your main.js file
  window.addEventListener('openStickerPicker', (e) => {
    const isPrivate = e.detail.isPrivate;
    // Open your sticker picker UI here
    // When a sticker is selected, call:
    if (isPrivate) {
      insertPrivateSticker(selectedStickerUrl);
    } else {
      // Your existing main chat sticker insertion
      insertSticker(selectedStickerUrl);
    }
  });

});

// Public chat sticker button
document.getElementById('stickerBtn').addEventListener('click', () => {
  const auth = loadAuth();
  if (auth) {
    openStickerShop(false); // main chat
  } else {
    alert('Please login to access stickers');
  }
});

// Private chat sticker button
document.getElementById('privateStickerBtn').addEventListener('click', (e) => {
  e.preventDefault();
  const auth = loadAuth();
  if (auth) {
    const recipient = document.getElementById('privateChatUsername').textContent;
    openStickerShop(true, recipient); // private mode
  } else {
    alert('Please login to access stickers');
  }
});

// Handle back button in private chat
document.getElementById('backToMainChat').addEventListener('click', closePrivateChat);