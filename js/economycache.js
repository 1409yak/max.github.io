// economyCache.js
import { getBalance, addCoins, setBalance } from './economy.js';
import { loadAuth } from './auth.js';

let cachedBalance = 0;
let lastSync = 0;
let intervalId = null;

export function getCachedBalance() {
  return cachedBalance;
}

export async function initBalanceCache(pollMs = 5000) {
  // Start an immediate sync but don't block callers
  syncBalance().catch(err => console.warn('Initial balance sync failed', err));

  // Clear previous interval if present
  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(() => {
    syncBalance().catch(err => console.warn('Balance sync failed', err));
  }, pollMs);
}

async function syncBalance() {
  const auth = loadAuth();
  if (!auth) return;
  const srvBal = await getBalance(auth.u);
  if (!isNaN(srvBal)) {
    cachedBalance = srvBal;
    lastSync = Date.now();
    const el = document.getElementById('bjBalance');
    if (el) el.textContent = `${cachedBalance} coins`;
  }
}

// Deduct from cache immediately and sync to server in background
export async function deductBalance(amount) {
  const auth = loadAuth();
  if (!auth) return false;
  if (cachedBalance < amount) return false;

  // optimistic
  cachedBalance -= amount;
  const el = document.getElementById('bjBalance');
  if (el) el.textContent = `${cachedBalance} coins`;

  // Fire-and-forget server update (no await so UI is instant)
  setBalance(auth.u, cachedBalance).catch(err =>
    console.error('Failed to sync deductBalance to server', err)
  );

  return true;
}

// Add to cache immediately and sync to server in background
export async function addToBalance(amount) {
  const auth = loadAuth();
  if (!auth) return false;

  // optimistic
  cachedBalance += amount;
  const el = document.getElementById('bjBalance');
  if (el) el.textContent = `${cachedBalance} coins`;

  // Fire-and-forget server update
  addCoins(auth.u, amount).catch(err =>
    console.error('Failed to sync addToBalance to server', err)
  );

  return true;
}
