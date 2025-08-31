import { loadAuth } from './auth.js';
import { postForm } from './api.js';

export function initWallet() {
  const walletBtn = document.getElementById('walletBtn');
  const walletModal = document.getElementById('walletModal');
  const walletContent = document.getElementById('walletContent');
  const closeWallet = document.getElementById('closeWallet');

  if (!walletBtn || !walletModal) {
    console.error("Wallet UI elements missing");
    return;
  }

  // Open wallet
  walletBtn.addEventListener('click', handleWalletClick);

  // Close with X
  if (closeWallet) {
    closeWallet.addEventListener('click', () => walletModal.hidden = true);
  }

  // Close by clicking background
  walletModal.addEventListener('click', (e) => {
    if (e.target === walletModal) walletModal.hidden = true;
  });

  async function handleWalletClick() {
    const auth = loadAuth();
    if (!auth) {
      alert("Please login first to access your wallet");
      return;
    }

    walletContent.innerHTML = '<div class="loading-wallet">Loading wallet...</div>';
    walletModal.hidden = false;

    try {
      const resp = await postForm({
        mode: 'getWallet',
        username: auth.u,
        password: auth.p
      });

      if (resp && resp.status === 'ok') {
        displayWalletData(resp);
      } else {
        walletContent.innerHTML = `
          <div class="wallet-error">
            <p>Error loading wallet: ${resp?.message || 'Unknown error'}</p>
            <button class="glass-btn" onclick="window.initWallet()">Retry</button>
          </div>
        `;
      }
    } catch (err) {
      console.error("Wallet API error:", err);
      walletContent.innerHTML = `
        <div class="wallet-error">
          <p>Network error loading wallet</p>
          <button class="glass-btn" onclick="window.initWallet()">Retry</button>
        </div>
      `;
    }
  }

  function displayWalletData(resp) {
    walletContent.innerHTML = `
        <div class="wallet-header">
            <h3>💰 My Crypto Wallet</h3>
            <button class="glass-btn primary" id="buyCryptoBtn">Buy Crypto</button>
            <button class="glass-btn" id="sellCryptoBtn">Sell Crypto</button>
        </div>

        <div class="wallet-balance">
            <h4>Total Portfolio Value</h4>
            <p class="total-value">$${resp.totalValue?.toFixed(2) || '0.00'}</p>
            <p class="available-balance">Available Balance: ${resp.balance?.toFixed(2) || '0'} coins</p>
        </div>

        <div class="wallet-assets">
            <h4>Your Assets</h4>
            ${
            resp.wallet?.length > 0
            ? resp.wallet.map(asset => `
                <div class="asset-card">
                    <div class="asset-header">
                    <span class="asset-symbol">${asset.symbol}</span>
                    <span class="asset-price">$${asset.price?.toFixed(2) || '0.00'}</span>
                    </div>
                    <div class="asset-details">
                    <span>Amount: ${asset.amount || '0'}</span>
                    <span>Value: $${(asset.amount * asset.price)?.toFixed(2) || '0.00'}</span>
                    <span>Avg Buy: $${asset.avg?.toFixed(2) || '0.00'}</span>
                    <span class="pnl ${asset.pnl >= 0 ? 'positive' : 'negative'}">
                        ${asset.pnl?.toFixed(2) || '0.00'}%
                    </span>
                    </div>
                    <button class="glass-btn sell-asset-btn" data-symbol="${asset.symbol}">Sell</button>
                </div>
                `).join('')
            : '<p class="no-assets">No crypto assets yet. Click "Buy Crypto" to get started!</p>'
            }
        </div>

        <div id="buyCryptoSection" class="buy-section" hidden>
            <h4>Buy Cryptocurrency</h4>
            <form id="buyCryptoForm" class="glass-form">
            <label class="glass-label">
                Select Crypto
                <select id="cryptoSelect" class="glass-input">
                <option value="BTC">Bitcoin (BTC)</option>
                <option value="ETH">Ethereum (ETH)</option>
                <option value="SOL">Solana (SOL)</option>
                <option value="DOGE">Dogecoin (DOGE)</option>
                </select>
            </label>
            <label class="glass-label">
                Amount to Buy ($)
                <input type="number" id="buyAmount" min="1" step="0.01" class="glass-input" placeholder="Enter amount in USD">
            </label>
            <button type="submit" class="glass-btn primary">Confirm Purchase</button>
            </form>
        </div>

        <div id="sellCryptoSection" class="sell-section" hidden>
            <h4>Sell Cryptocurrency</h4>
            <form id="sellCryptoForm" class="glass-form">
            <label class="glass-label">
                Select Crypto
                <select id="sellCryptoSelect" class="glass-input">
                ${resp.wallet?.length > 0 ? resp.wallet.map(asset => `
                    <option value="${asset.symbol}">${asset.symbol} (Available: ${asset.amount})</option>
                `).join('') : '<option disabled>No assets to sell</option>'}
                </select>
            </label>
            <label class="glass-label">
                Amount to Sell
                <input type="number" id="sellAmount" min="0.0001" step="0.0001" class="glass-input" placeholder="Enter amount to sell">
            </label>
            <button type="submit" class="glass-btn danger">Confirm Sale</button>
            </form>
        </div>
        `;


    // Add sell button functionality
    const sellCryptoBtn = document.getElementById('sellCryptoBtn');
    if (sellCryptoBtn) {
    sellCryptoBtn.addEventListener('click', () => {
        const sellSection = document.getElementById('sellCryptoSection');
        sellSection.hidden = !sellSection.hidden;
        // Hide buy section if open
        document.getElementById('buyCryptoSection').hidden = true;
    });
    }

    // Add sell form submission
    const sellCryptoForm = document.getElementById('sellCryptoForm');
    if (sellCryptoForm) {
    sellCryptoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cryptoSymbol = document.getElementById('sellCryptoSelect').value;
        const sellAmount = document.getElementById('sellAmount').value;

        const auth = loadAuth();
        if (!auth) {
        alert("Not logged in");
        return;
        }

        try {
        const sellResp = await postForm({
            mode: 'sellCrypto',
            username: auth.u,
            password: auth.p,
            symbol: cryptoSymbol,
            amount: sellAmount
        });

        if (sellResp.status === 'ok') {
            alert(`Successfully sold ${sellAmount} ${cryptoSymbol} for $${sellResp.proceeds}`);
            handleWalletClick(); // refresh wallet
        } else {
            alert(`Sale failed: ${sellResp.message || 'Unknown error'}`);
        }
        } catch (err) {
        console.error("Sell error:", err);
        alert("Network error while selling crypto");
        }
    });
    }

    // Add individual asset sell buttons
    document.querySelectorAll('.sell-asset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const symbol = btn.getAttribute('data-symbol');
        document.getElementById('sellCryptoSelect').value = symbol;
        document.getElementById('sellCryptoSection').hidden = false;
        document.getElementById('buyCryptoSection').hidden = true;
    });
    });

    // Toggle buy form
    const buyCryptoBtn = document.getElementById('buyCryptoBtn');
    if (buyCryptoBtn) {
      buyCryptoBtn.addEventListener('click', () => {
        const buySection = document.getElementById('buyCryptoSection');
        buySection.hidden = !buySection.hidden;
      });
    }

    // Handle buy submit
    const buyCryptoForm = document.getElementById('buyCryptoForm');
    if (buyCryptoForm) {
      buyCryptoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cryptoSelect = document.getElementById('cryptoSelect').value;
        const buyAmount = document.getElementById('buyAmount').value;

        const auth = loadAuth();
        if (!auth) {
          alert("Not logged in");
          return;
        }

        try {
          const buyResp = await postForm({
            mode: 'buyCrypto',
            username: auth.u,
            password: auth.p,
            symbol: cryptoSelect,
            amount: buyAmount
          });

          if (buyResp.status === 'ok') {
            alert(`Successfully bought $${buyAmount} of ${cryptoSelect}`);
            handleWalletClick(); // refresh wallet
          } else {
            alert(`Purchase failed: ${buyResp.message || 'Unknown error'}`);
          }
        } catch (err) {
          console.error("Buy error:", err);
          alert("Network error while buying crypto");
        }
      });
    }
  }
}

// expose for retry button
window.initWallet = initWallet;
