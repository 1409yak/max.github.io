// blackjack.js
import { loadAuth } from './auth.js';
import { getCachedBalance, deductBalance, addToBalance } from './economyCache.js';

let blackjackModal, betInput, startBtn, gameArea, statusEl, actionBtns;
let deck, playerHand, dealerHand, betAmount, gameOver;

export function initBlackjack() {
  // Create modal HTML dynamically (id bjBalance added)
  blackjackModal = document.createElement('section');
  blackjackModal.className = 'glass-modal';
  blackjackModal.id = 'blackjackModal';
  blackjackModal.hidden = true;

  blackjackModal.innerHTML = `
    <h2>Blackjack 🎲</h2>
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:8px;">
      <label style="margin:0;">
        Bet: <input type="number" id="bjBet" min="1" value="100" style="width:110px;padding:6px;" />
      </label>
      <button id="bjStart" class="glass-btn primary">Start</button>
      <div id="bjBalance" style="margin-left:8px;">0 coins</div>
    </div>
    <div id="bjStatus" class="glass-hint" style="min-height:1.4em;margin-bottom:8px;"></div>

    <div id="bjGame" style="display:none;margin-bottom:8px;">
      <p><strong>Dealer:</strong> <span id="dealerHand"></span></p>
      <p><strong>You:</strong> <span id="playerHand"></span></p>
      <div id="bjActions" style="display:flex;gap:8px;margin-top:8px;">
        <button id="bjHit" class="glass-btn">Hit</button>
        <button id="bjStand" class="glass-btn">Stand</button>
      </div>
    </div>

    <div class="modal-actions">
      <button id="bjClose" class="glass-btn">Close</button>
    </div>
  `;

  document.body.appendChild(blackjackModal);

  // DOM refs
  betInput = blackjackModal.querySelector('#bjBet');
  startBtn = blackjackModal.querySelector('#bjStart');
  gameArea = blackjackModal.querySelector('#bjGame');
  statusEl = blackjackModal.querySelector('#bjStatus');
  actionBtns = {
    hit: blackjackModal.querySelector('#bjHit'),
    stand: blackjackModal.querySelector('#bjStand')
  };

  // Event listeners
  startBtn.onclick = startGame;
  actionBtns.hit.onclick = () => playerAction('hit');
  actionBtns.stand.onclick = () => playerAction('stand');
  blackjackModal.querySelector('#bjClose').onclick = () => {
    // closing while a round is active will forfeit the bet (per your rules)
    resetRound();
    blackjackModal.hidden = true;
  };

  // Add header button once
  const header = document.querySelector('.header-actions');
  if (header && !document.getElementById('headerBJBtn')) {
    const bjBtn = document.createElement('button');
    bjBtn.id = 'headerBJBtn';
    bjBtn.className = 'glass-btn';
    bjBtn.textContent = '🎲';
    bjBtn.onclick = () => {
      blackjackModal.hidden = false;
      updateBalanceUI();
    };
    header.appendChild(bjBtn);
  }

  // initial UI balance
  updateBalanceUI();
}

/* ====== GAME HELPERS ====== */
function createDeck() {
  const suits = ['♠','♥','♦','♣'];
  const ranks = [
    {r:'A',v:11}, {r:'2',v:2}, {r:'3',v:3}, {r:'4',v:4}, {r:'5',v:5},
    {r:'6',v:6}, {r:'7',v:7}, {r:'8',v:8}, {r:'9',v:9}, {r:'10',v:10},
    {r:'J',v:10}, {r:'Q',v:10}, {r:'K',v:10}
  ];
  let d = [];
  for (let s of suits) {
    for (let r of ranks) d.push({rank:r.r, suit:s, val:r.v});
  }
  return shuffle(d);
}

function shuffle(a) {
  for (let i=a.length-1;i>0;i--){
    let j=Math.floor(Math.random()* (i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function handValue(hand) {
  let total = hand.reduce((sum,c)=>sum+c.val,0);
  let aces = hand.filter(c=>c.rank==='A').length;
  while(total>21 && aces>0) {
    total -= 10; aces--;
  }
  return total;
}

function renderHands(showDealer=false) {
  const dealerEl = blackjackModal.querySelector('#dealerHand');
  const playerEl = blackjackModal.querySelector('#playerHand');
  dealerEl.textContent = dealerHand.map((c,i)=>
    (i===0||showDealer)? `${c.rank}${c.suit}` : '??'
  ).join(' ');
  playerEl.textContent = playerHand.map(c=>`${c.rank}${c.suit}`).join(' ')
    + ` (${handValue(playerHand)})`;
}

function updateBalanceUI() {
  const el = document.getElementById('bjBalance');
  if (!el) return;
  el.textContent = `${getCachedBalance()} coins`;
}

function resetRound() {
  deck = null;
  playerHand = null;
  dealerHand = null;
  betAmount = 0;
  gameOver = true;
  gameArea.style.display = 'none';
  statusEl.textContent = '';
}

/* ====== MAIN ACTIONS ====== */
async function startGame() {
  const auth = loadAuth();
  if (!auth) { statusEl.textContent='Login first!'; return; }

  betAmount = Number(betInput.value||0);
  if (betAmount <= 0) { statusEl.textContent='Invalid bet.'; return; }

  const balance = getCachedBalance();
  updateBalanceUI();
  if (balance < betAmount) { statusEl.textContent='Not enough coins.'; return; }

  // Deduct bet from cache + fire background sync
  const ok = await deductBalance(betAmount);
  if (!ok) {
    statusEl.textContent = 'Failed to place bet.';
    return;
  }

  deck = createDeck();
  playerHand = [deck.pop(), deck.pop()];
  dealerHand = [deck.pop(), deck.pop()];
  gameOver = false;

  statusEl.textContent = `Bet placed: ${betAmount} coins`;
  gameArea.style.display = '';
  renderHands();
  updateBalanceUI();
}

async function playerAction(action) {
  if (gameOver) return;

  if (action === 'hit') {
    playerHand.push(deck.pop());
    renderHands();
    if (handValue(playerHand) > 21) return endGame();
  }

  if (action === 'stand') {
    dealerTurn();
  }

  updateBalanceUI();
}

function dealerTurn() {
  while (handValue(dealerHand) < 17) dealerHand.push(deck.pop());
  endGame(true);
}

async function endGame(showDealer=false) {
  gameOver = true;
  renderHands(true);
  const pv = handValue(playerHand), dv = handValue(dealerHand);
  let msg = '';

  if (pv > 21) msg = 'You bust! ❌';
  else if (dv > 21) msg = 'Dealer busts! You win ✅';
  else if (pv > dv) msg = 'You win ✅';
  else if (pv < dv) msg = 'You lose ❌';
  else msg = 'Push (tie) 🤝';

  statusEl.textContent = msg;

  // Settlement using cache (fast). Server sync happens in economyCache's addToBalance.
  if (pv <= 21 && (dv > 21 || pv > dv)) {
    // player wins: give 2x (per your rules)
    await addToBalance(betAmount * 2);
    statusEl.textContent += ` — You won ${betAmount * 2} coins!`;
  } else if (pv === dv) {
    // push: return bet
    await addToBalance(betAmount);
    statusEl.textContent += ` — Bet returned.`;
  } else {
    // lost: nothing to do (bet already deducted)
  }

  updateBalanceUI();

  // keep hands visible; start new round only when user clicks Start again
}