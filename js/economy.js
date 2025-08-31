// economy.js
import { postForm } from './api.js';
import { loadAuth } from './auth.js';
import { preloadProfiles } from './profiles.js';

// Get balance of current user
export async function getBalance(username) {
  try {
    const auth = loadAuth();
    if (!auth) return 0;
    
    const resp = await postForm({
      mode: 'getbalance',
      username: auth.u,
      password: auth.p
    });

    if (resp.status === 'ok') {
      return resp.balance || 0;
    } else {
      console.error('Failed to get balance:', resp.message);
      return 0;
    }
  } catch (err) {
    console.error('Error getting balance:', err);
    return 0;
  }
}

// Increase balance of current user
export async function addCoins(username, amount = 5) {
  try {
    const auth = loadAuth();
    if (!auth) return false;
    
    const resp = await postForm({
      mode: 'addbalance',
      username: auth.u,
      password: auth.p,
      amount
    });

    if (resp.status === 'ok') {
      // Refresh cached profiles so new balance shows up
      await preloadProfiles();
      return true;
    } else {
      console.error('Failed to add coins:', resp.message);
      return false;
    }
  } catch (err) {
    console.error('Error adding coins:', err);
    return false;
  }
}

// Set balance to specific amount (admin function)
export async function setBalance(username, newBalance) {
  try {
    const auth = loadAuth();
    if (!auth) return false;
    
    const resp = await postForm({
      mode: 'setbalance',
      username: auth.u,
      password: auth.p,
      amount: newBalance
    });

    if (resp.status === 'ok') {
      await preloadProfiles();
      return true;
    } else {
      console.error('Failed to set balance:', resp.message);
      return false;
    }
  } catch (err) {
    console.error('Error setting balance:', err);
    return false;
  }
}

// Transfer coins to another user
export async function sendPayment(toUser, amount) {
  try {
    const auth = loadAuth();
    if (!auth) return { success: false, error: 'Not logged in' };
    
    const resp = await postForm({
      mode: 'pay',
      username: auth.u,
      password: auth.p,
      to: toUser,
      amount
    });

    if (resp.status === 'ok') {
      await preloadProfiles();
      return { 
        success: true, 
        newBalance: resp.newBalance,
        from: resp.from,
        to: resp.to,
        amount: resp.amount
      };
    } else {
      return { success: false, error: resp.message || 'Payment failed' };
    }
  } catch (err) {
    console.error('Error sending payment:', err);
    return { success: false, error: err.message || 'Payment failed' };
  }
}

// Format currency display
export function formatCoins(amount) {
  return `${amount} coin${amount !== 1 ? 's' : ''}`;
}

// Check if user can afford something
export function canAfford(currentBalance, cost) {
  return currentBalance >= cost;
}

// Economy-related UI updates
export function updateBalanceDisplay(balanceElement, amount) {
  if (balanceElement) {
    balanceElement.textContent = formatCoins(amount);
    balanceElement.title = `Your balance: ${amount} coins`;
  }
}

// Auto-refresh balance periodically
let balanceRefreshInterval = null;

export function startBalanceAutoRefresh(callback, interval = 30000) {
  stopBalanceAutoRefresh();
  balanceRefreshInterval = setInterval(async () => {
    const auth = loadAuth();
    if (auth) {
      const balance = await getBalance(auth.u);
      if (callback) callback(balance);
    }
  }, interval);
}

export function stopBalanceAutoRefresh() {
  if (balanceRefreshInterval) {
    clearInterval(balanceRefreshInterval);
    balanceRefreshInterval = null;
  }
}