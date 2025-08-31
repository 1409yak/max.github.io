// stickers.js
import { postForm } from './api.js';
import { loadAuth } from './auth.js';
import { refreshUserBalance } from './profiles.js';
import { sendMessage } from './chat.js'; // Import the sendMessage function

// Sticker configuration
const STICKER_COUNT = 100;
const INDIVIDUAL_PRICE = 500;

// DOM Elements
let stickerModal = null;
let userStickerGrid = null;
let shopStickerGrid = null;

// Sticker data and state management
let userStickers = [];
let allStickers = [];
let isStickersLoaded = false;
let stickerLoadPromise = null;

export async function initStickers() {
  // Only load once
  if (stickerLoadPromise) {
    return stickerLoadPromise;
  }
  
  if (isStickersLoaded) {
    return Promise.resolve();
  }
  
  stickerLoadPromise = loadUserStickers()
    .then(() => {
      isStickersLoaded = true;
      createStickerUI();
    })
    .catch(error => {
      console.error('Failed to load stickers:', error);
      // Still create UI with empty state
      allStickers = generateStickers();
      isStickersLoaded = true;
      createStickerUI();
    });
  
  return stickerLoadPromise;
}

// Generate sticker objects for bg1.png to bg30.png
function generateStickers() {
  const stickers = [];
  for (let i = 1; i <= STICKER_COUNT; i++) {
    const padded = String(i).padStart(3, '0'); // "001", "002", ...
    const stickerName = `${padded}.png`;
    stickers.push({
      id: i,
      name: stickerName,
      url: `../stickers/${padded}.png`,
      cost: INDIVIDUAL_PRICE,
      purchased: userStickers.includes(i)
    });
  }
  return stickers;
}

// Load user's purchased stickers from server
async function loadUserStickers() {
  const auth = loadAuth();
  if (!auth) {
    allStickers = generateStickers();
    return;
  }
  
  try {
    const response = await postForm({
      mode: 'getUserStickers',
      username: auth.u,
      password: auth.p
    });
    
    if (response.status === 'ok') {
      // Convert sticker names to IDs (e.g., "bg1.png" -> 1)
      userStickers = (response.stickers || []).map(stickerName => {
        if (typeof stickerName !== 'string') return null;
        const match = stickerName.match(/^(\d{3})\.png$/); // e.g. "001.png"
        return match ? parseInt(match[1], 10) : null;
      }).filter(id => id !== null && id >= 1 && id <= STICKER_COUNT);

      allStickers = generateStickers();
    } else {
      console.error('Failed to load user stickers:', response.message);
      allStickers = generateStickers();
    }
  } catch (error) {
    console.error('Error loading user stickers:', error);
    allStickers = generateStickers();
    throw error; // Re-throw to handle in initStickers
  }
}

function createStickerUI() {
  if (document.getElementById('stickerModal')) {
    stickerModal = document.getElementById('stickerModal');
    userStickerGrid = stickerModal.querySelector('.user-stickers-grid');
    shopStickerGrid = stickerModal.querySelector('.shop-stickers-grid');
    renderStickers();
    return;
  }
  
  stickerModal = document.createElement('div');
  stickerModal.id = 'stickerModal';
  stickerModal.className = 'sticker-modal';
  stickerModal.hidden = true;
  
  stickerModal.innerHTML = `
    <div class="sticker-modal-content">
      <div class="sticker-modal-header">
        <h3>💎 Stickers Shop</h3>
        <button class="close-sticker-modal">✕</button>
      </div>
      
      <div class="sticker-layout">
        <!-- Left Side: User's Stickers -->
        <div class="user-stickers-section">
          <h4>Your Stickers</h4>
          <div class="user-stickers-grid"></div>
          <p class="empty-message">You haven't purchased any stickers yet</p>
        </div>
        
        <!-- Right Side: Shop -->
        <div class="shop-section">
          <!-- Sticker Pack Option -->
        
          
          <!-- Individual Stickers Option -->
          <div class="individual-stickers-section">
            <h4>Stickers</h4>
            <p class="individual-price">${INDIVIDUAL_PRICE} coins each</p>
            <div class="shop-stickers-grid"></div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(stickerModal);
  
  // Get grid containers
  userStickerGrid = stickerModal.querySelector('.user-stickers-grid');
  shopStickerGrid = stickerModal.querySelector('.shop-stickers-grid');
  
  // Event listeners
  stickerModal.querySelector('.close-sticker-modal').addEventListener('click', closeStickerModal);
  stickerModal.querySelector('#buyStickerPack').addEventListener('click', buyStickerPack);
  
  // Close modal when clicking outside
  stickerModal.addEventListener('click', (e) => {
    if (e.target === stickerModal) {
      closeStickerModal();
    }
  });
  
  renderStickers();
}

function renderStickers() {
  if (!userStickerGrid || !shopStickerGrid || !isStickersLoaded) {
    return;
  }
  
  // Clear grids
  userStickerGrid.innerHTML = '';
  shopStickerGrid.innerHTML = '';
  
  let hasPurchasedStickers = false;
  
  allStickers.forEach(sticker => {
    if (sticker.purchased) {
      renderUserSticker(sticker);
      hasPurchasedStickers = true;
    } else {
      renderShopSticker(sticker);
    }
  });
  
  // Show/hide empty message
  const emptyMessage = stickerModal.querySelector('.empty-message');
  if (emptyMessage) {
    emptyMessage.style.display = hasPurchasedStickers ? 'none' : 'block';
  }
}

function renderUserSticker(sticker) {
  const stickerElement = document.createElement('div');
  stickerElement.className = 'sticker-item user-sticker';
  stickerElement.innerHTML = `
    <img src="${sticker.url}" alt="${sticker.name}" class="sticker-img">
    <div class="sticker-overlay">
      <button class="send-sticker" data-sticker-id="${sticker.id}">
        Send
      </button>
    </div>
  `;
  
  stickerElement.querySelector('.send-sticker').addEventListener('click', () => {
    sendSticker(sticker.id);
  });
  
  userStickerGrid.appendChild(stickerElement);
}

function renderShopSticker(sticker) {
  const stickerElement = document.createElement('div');
  stickerElement.className = 'sticker-item shop-sticker';
  stickerElement.innerHTML = `
    <img src="${sticker.url}" alt="${sticker.name}" class="sticker-img">
    <div class="sticker-overlay">
      <button class="buy-sticker" data-sticker-id="${sticker.id}">
        Buy - ${sticker.cost} coins
      </button>
    </div>
  `;
  
  stickerElement.querySelector('.buy-sticker').addEventListener('click', () => {
    buyIndividualSticker(sticker.id);
  });
  
  shopStickerGrid.appendChild(stickerElement);
}

async function buyIndividualSticker(stickerId) {
  const auth = loadAuth();
  if (!auth) {
    alert('Please login to buy stickers');
    return;
  }
  
  const sticker = allStickers.find(s => s.id === stickerId);
  if (!sticker) {
    console.error('Sticker not found:', stickerId);
    return;
  }
  
  if (!confirm(`Buy "${sticker.name}" for ${sticker.cost} coins?`)) {
    return;
  }
  
  try {
    const response = await postForm({
      mode: 'buySticker',
      username: auth.u,
      password: auth.p,
      sticker_name: sticker.name
    });
    
    if (response.status === 'ok') {
      // Update local state
      if (!userStickers.includes(stickerId)) {
        userStickers.push(stickerId);
      }
      
      // Update the specific sticker's purchased status
      const stickerToUpdate = allStickers.find(s => s.id === stickerId);
      if (stickerToUpdate) {
        stickerToUpdate.purchased = true;
      }
      
      alert('Sticker purchased successfully!');
      renderStickers();
      refreshUserBalance(auth.u);
    } else {
      alert(response.message || 'Failed to purchase sticker');
    }
  } catch (error) {
    console.error('Purchase error:', error);
    alert('Failed to purchase sticker: ' + error.message);
  }
}

async function buyStickerPack() {
  const auth = loadAuth();
  if (!auth) {
    alert('Please login to buy sticker packs');
    return;
  }
  
  if (!confirm(`Buy the complete sticker pack for ${STICKER_PACK_PRICE.toLocaleString()} coins?`)) {
    return;
  }
  
  try {
    const response = await postForm({
      mode: 'buyStickerPack',
      username: auth.u,
      password: auth.p
    });
    
    if (response.status === 'ok') {
      // Update userStickers with all sticker IDs
      userStickers = Array.from({length: STICKER_COUNT}, (_, i) => i + 1);
      
      // Mark all stickers as purchased
      allStickers.forEach(sticker => {
        sticker.purchased = true;
      });
      
      alert('Sticker pack purchased! You now have access to all stickers!');
      renderStickers();
      refreshUserBalance(auth.u);
    } else {
      alert(response.message || 'Failed to purchase sticker pack');
    }
  } catch (error) {
    alert('Failed to purchase sticker pack: ' + error.message);
  }
}

async function sendSticker(stickerId) {
  const auth = loadAuth();
  if (!auth) {
    alert('Please login to send stickers');
    return;
  }

  const sticker = allStickers.find(s => s.id === stickerId);
  if (!sticker) {
    alert('Sticker not found');
    return;
  }

  // Create the sticker message text
  const stickerMessage = `STICKER::${sticker.url}`;
  
  // Use the sendMessage function to send the sticker
  const success = sendMessage(stickerMessage);
  
  if (success) {
    // Close the sticker modal immediately after sending
    closeStickerModal();
  }
}

export async function openStickerShop() {
  try {
    // Ensure stickers are loaded before showing the modal
    if (!isStickersLoaded) {
      await initStickers();
    }
    
    if (!stickerModal) {
      createStickerUI();
    }
    
    stickerModal.hidden = false;
    document.body.style.overflow = 'hidden';
    
  } catch (error) {
    console.error('Failed to open sticker shop:', error);
    alert('Failed to load stickers. Please try again.');
  }
}

function closeStickerModal() {
  if (!stickerModal) return;
  stickerModal.hidden = true;
  document.body.style.overflow = '';
}

// Simple function to check if stickers are loaded (for debugging)
export function areStickersLoaded() {
  return isStickersLoaded;
}