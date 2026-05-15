import { BALL_COLORS, SOLIDS, STRIPES } from './constants.js';

let overlay = null;
let screens = {};
let msgTimer = null;

export function initUI(canvasContainer) {
  if (document.getElementById('pool-ui-overlay')) {
    overlay = document.getElementById('pool-ui-overlay');
    screens = {
      lobby:  document.getElementById('pool-screen-lobby'),
      room:   document.getElementById('pool-screen-room'),
      hud:    document.getElementById('pool-screen-hud'),
      result: document.getElementById('pool-screen-result'),
    };
    return;
  }

  overlay = document.createElement('div');
  overlay.id = 'pool-ui-overlay';
  overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;';

  const names = ['lobby', 'room', 'hud', 'result'];
  for (const n of names) {
    const el = document.createElement('div');
    el.id = `pool-screen-${n}`;
    el.style.display = 'none';
    el.style.pointerEvents = n === 'hud' ? 'none' : 'all';
    overlay.appendChild(el);
    screens[n] = el;
  }

  canvasContainer.style.position = 'relative';
  canvasContainer.appendChild(overlay);
}

export function showScreen(name, data = {}) {
  for (const s of Object.values(screens)) s.style.display = 'none';
  if (!screens[name]) return;
  screens[name].style.display = 'block';
  if (name === 'lobby')  renderLobby(screens[name], data);
  if (name === 'room')   renderRoom(screens[name], data);
  if (name === 'hud')    renderHUD(screens[name], data);
  if (name === 'result') renderResult(screens[name], data);
}

// ── Lobby ─────────────────────────────────────────────────────────────────────
function renderLobby(el, { onCreateRoom, onJoinRoom, onPlayLocal, onPlayVsAI }) {
  el.innerHTML = `
    <div class="pool-panel pool-lobby-panel">
      <div class="pool-title">POOL</div>
      <div class="pool-section">
        <div class="pool-local-label">vs CPU</div>
        <input id="pool-ai-p1" class="pool-input" type="text" maxlength="16" placeholder="Your name" />
        <button id="pool-play-ai" class="pool-btn pool-btn-primary">Play vs AI</button>
      </div>
      <div class="pool-divider"></div>
      <div class="pool-section">
        <div class="pool-local-label">Local Game</div>
        <input id="pool-local-p1" class="pool-input" type="text" maxlength="16" placeholder="Player 1 name" />
        <input id="pool-local-p2" class="pool-input" type="text" maxlength="16" placeholder="Player 2 name" />
        <button id="pool-play-local" class="pool-btn pool-btn-secondary">Play Local</button>
      </div>
      <div class="pool-divider"></div>
      <div class="pool-section">
        <div class="pool-local-label">Online</div>
        <input id="pool-name" class="pool-input" type="text" maxlength="16" placeholder="Your name" />
        <button id="pool-create" class="pool-btn pool-btn-secondary">Create Room</button>
      </div>
      <div class="pool-section pool-row">
        <input id="pool-join-code" class="pool-input pool-input-code" type="text" maxlength="6" placeholder="ROOM CODE" />
        <button id="pool-join" class="pool-btn pool-btn-secondary">Join Room</button>
      </div>
    </div>`;

  el.querySelector('#pool-join-code').addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase();
  });
  el.querySelector('#pool-play-ai').addEventListener('click', () => {
    const p1 = el.querySelector('#pool-ai-p1').value.trim() || 'Player';
    onPlayVsAI(p1);
  });
  el.querySelector('#pool-play-local').addEventListener('click', () => {
    const p1 = el.querySelector('#pool-local-p1').value.trim() || 'Player 1';
    const p2 = el.querySelector('#pool-local-p2').value.trim() || 'Player 2';
    onPlayLocal(p1, p2);
  });
  el.querySelector('#pool-create').addEventListener('click', () => {
    const name = el.querySelector('#pool-name').value.trim() || 'Player';
    onCreateRoom(name);
  });
  el.querySelector('#pool-join').addEventListener('click', () => {
    const name = el.querySelector('#pool-name').value.trim() || 'Player';
    const code = el.querySelector('#pool-join-code').value.trim().toUpperCase();
    if (code.length < 4) { showMessage('Room code must be at least 4 characters'); return; }
    onJoinRoom(name, code);
  });
}

// ── Room waiting ──────────────────────────────────────────────────────────────
function renderRoom(el, { roomCode, localName, opponentName, isHost, onStart, onLeave }) {
  el.innerHTML = `
    <div class="pool-panel pool-room-panel">
      <div class="pool-title">WAITING ROOM</div>
      <div class="pool-room-code-label">Room Code</div>
      <div class="pool-room-code-row">
        <span class="pool-room-code">${roomCode || '------'}</span>
        <button class="pool-btn pool-btn-xs" id="pool-copy">Copy</button>
      </div>
      <div class="pool-players">
        <div class="pool-player-slot pool-slot-filled">
          <span class="pool-slot-label">Player 1</span>
          <span class="pool-slot-name">${localName || 'You'}</span>
        </div>
        <div class="pool-player-slot ${opponentName ? 'pool-slot-filled' : 'pool-slot-empty'}">
          <span class="pool-slot-label">Player 2</span>
          <span class="pool-slot-name">${opponentName || 'Waiting...'}</span>
        </div>
      </div>
      ${isHost && opponentName
        ? `<button class="pool-btn pool-btn-primary" id="pool-start">Start Game</button>`
        : isHost
          ? `<div class="pool-waiting-msg">Waiting for opponent...</div>`
          : `<div class="pool-waiting-msg">Waiting for host to start...</div>`
      }
      <button class="pool-btn pool-btn-secondary pool-leave" id="pool-leave">Leave Room</button>
    </div>`;

  el.querySelector('#pool-copy')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(roomCode).catch(() => {});
  });
  el.querySelector('#pool-start')?.addEventListener('click', () => { if (onStart) onStart(); });
  el.querySelector('#pool-leave')?.addEventListener('click', () => { if (onLeave) onLeave(); });
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function renderHUD(el, { players, currentTurn, myPlayerNum, localMode, aiMode, powerVisible, powerPct }) {
  const p1 = players?.[0] || { name: 'P1', group: null, pocketed: [] };
  const p2 = players?.[1] || { name: 'P2', group: null, pocketed: [] };

  const ballIndicators = (player) => {
    const group = player.group;
    const indices = group === 'solids' ? SOLIDS : group === 'stripes' ? STRIPES : [...SOLIDS, ...STRIPES];
    return indices.map(i => {
      const pocketed = player.pocketed.includes(i);
      const col = BALL_COLORS[i];
      return `<span class="pool-ball-dot${pocketed ? ' pool-ball-pocketed' : ''}" style="background:${col}"></span>`;
    }).join('');
  };

  const currentPlayer = players?.[currentTurn - 1];
  let turnText, turnClass;
  if (localMode) {
    turnText  = `${currentPlayer?.name?.toUpperCase() || 'P' + currentTurn}'S TURN`;
    turnClass = 'pool-my-turn';
  } else if (aiMode) {
    if (currentTurn === 2) {
      turnText  = 'CPU THINKING…';
      turnClass = 'pool-opp-turn';
    } else {
      turnText  = 'YOUR TURN';
      turnClass = 'pool-my-turn';
    }
  } else {
    const myTurn = currentTurn === myPlayerNum;
    turnText  = myTurn ? 'YOUR TURN' : "OPPONENT'S TURN";
    turnClass = myTurn ? 'pool-my-turn' : 'pool-opp-turn';
  }

  el.innerHTML = `
    <div class="pool-hud-bar">
      <div class="pool-hud-player ${currentTurn === 1 ? 'pool-hud-active' : ''}">
        <div class="pool-hud-name">${p1.name}</div>
        <div class="pool-hud-balls">${ballIndicators(p1)}</div>
      </div>
      <div class="pool-hud-center">
        <div class="pool-turn-indicator ${turnClass}">
          ${turnText}
        </div>
      </div>
      <div class="pool-hud-player ${currentTurn === 2 ? 'pool-hud-active' : ''}">
        <div class="pool-hud-name">${p2.name}</div>
        <div class="pool-hud-balls">${ballIndicators(p2)}</div>
      </div>
    </div>
    <div id="pool-msg-area" class="pool-msg-area"></div>
    <div id="pool-power-bar-wrap" class="pool-power-bar-wrap" style="display:${powerVisible ? 'flex' : 'none'}">
      <div class="pool-power-bar-bg">
        <div class="pool-power-bar-fill" style="width:${(powerPct || 0) * 100}%;background:hsl(${(1 - (powerPct || 0)) * 120},90%,45%)"></div>
      </div>
    </div>`;
}

// ── Result screen ─────────────────────────────────────────────────────────────
function renderResult(el, { win, title, message, onPlayAgain, onMainMenu }) {
  el.innerHTML = `
    <div class="pool-result-overlay">
      <div class="pool-result-box">
        <div class="pool-result-icon">${win ? '🏆' : '😔'}</div>
        <div class="pool-result-title">${title || (win ? 'You Win!' : 'You Lose!')}</div>
        <div class="pool-result-msg">${message || ''}</div>
        <button class="pool-btn pool-btn-primary" id="pool-play-again">Play Again</button>
        <button class="pool-btn pool-btn-secondary" id="pool-main-menu">Main Menu</button>
      </div>
    </div>`;

  el.querySelector('#pool-play-again')?.addEventListener('click', () => { if (onPlayAgain) onPlayAgain(); });
  el.querySelector('#pool-main-menu')?.addEventListener('click', () => { if (onMainMenu) onMainMenu(); });
}

// ── HUD update helpers (called each frame or on event) ────────────────────────
export function updateHUD(data) {
  if (screens.hud.style.display !== 'none') renderHUD(screens.hud, data);
}

export function showMessage(text) {
  const msgEl = document.getElementById('pool-msg-area');
  if (!msgEl) return;
  if (msgTimer) clearTimeout(msgTimer);
  msgEl.textContent = text;
  msgEl.style.opacity = '1';
  msgEl.style.display = text ? 'block' : 'none';
  if (text) {
    msgTimer = setTimeout(() => {
      msgEl.style.opacity = '0';
      setTimeout(() => { msgEl.style.display = 'none'; }, 600);
    }, 3000);
  }
}

export function updatePowerBar(visible, pct) {
  const wrap = document.getElementById('pool-power-bar-wrap');
  if (!wrap) return;
  wrap.style.display = visible ? 'flex' : 'none';
  if (visible) {
    const fill = wrap.querySelector('.pool-power-bar-fill');
    if (fill) {
      fill.style.width = `${pct * 100}%`;
      fill.style.background = `hsl(${(1 - pct) * 120},90%,45%)`;
    }
  }
}
