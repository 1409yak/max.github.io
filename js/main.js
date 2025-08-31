import { loadAuth } from './auth.js';
import { preloadProfiles } from './profiles.js';
import { enterChat, leaveChat } from './ui.js';
import { initStickers, openStickerShop } from './stickers.js';
import { initBlackjack } from './blackjack.js';
import { initBalanceCache } from './economyCache.js';
import { initWallet } from './wallet.js';

initBalanceCache(5000);
initBlackjack();

(function init() {
  preloadProfiles();
  const auth = loadAuth();
  if (auth && auth.u && auth.p) enterChat(auth.u);
  else leaveChat();

  initWallet();
})();

document.addEventListener('DOMContentLoaded', () => {
  initStickers();
});

document.getElementById('stickerBtn').addEventListener('click', () => {
  const auth = loadAuth();
  if (auth) openStickerShop();
  else alert('Please login to access stickers');
});
