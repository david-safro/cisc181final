import { loadAudio, playSound, startMusic, stopMusic, toggleMute } from './audio.js';
import {
  initPhysics, setupRack, applyShot, allSleeping,
  updatePhysics, getSnapshot, applySnapshot, getBallState, placeBall,
  posX, posY, active,
} from './physics.js';
import { renderFrame, project, reverseProject } from './renderer.js';
import { initUI, showScreen, updateHUD, showMessage, updatePowerBar } from './ui.js';
import * as network from './network.js';
import {
  gameState, turnState, initScoring, initGameState,
  resetTurnState, onCueBallHit, onBallRailHit, onBallPocketed, resolveTurn, switchTurn,
} from './scoring.js';
import {
  TABLE_WIDTH, TABLE_HEIGHT, RAIL_THICKNESS, BALL_RADIUS,
  CUE_MAX_POWER, CUE_MIN_POWER, CUE_POWER_RATE, EIGHT_BALL,
  BREAK_X, BREAK_Y,
} from './constants.js';
import { computeAiShot } from './ai.js';

const STYLE_ID = 'pool-styles';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #pool-ui-overlay { font-family: 'Segoe UI', sans-serif; }

    .pool-panel {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(10,20,10,0.94);
      border: 1.5px solid #1a6b3c;
      border-radius: 14px;
      padding: 32px 40px;
      min-width: 340px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.7);
      color: #e8f5e9;
      display: flex; flex-direction: column; align-items: center; gap: 14px;
    }
    .pool-title {
      font-size: 2.6rem; font-weight: 900; letter-spacing: 0.18em;
      color: #d4a85a; text-shadow: 0 2px 12px rgba(212,168,90,0.4);
    }
    .pool-section { display: flex; flex-direction: column; gap: 10px; width: 100%; align-items: center; }
    .pool-row { flex-direction: row !important; }
    .pool-input {
      background: rgba(255,255,255,0.07); border: 1px solid #1a6b3c;
      border-radius: 8px; color: #e8f5e9; padding: 9px 14px; font-size: 1rem;
      outline: none; width: 100%; box-sizing: border-box;
    }
    .pool-input-code { width: 140px !important; text-align: center; letter-spacing: 0.2em; font-weight: 700; }
    .pool-input:focus { border-color: #d4a85a; }
    .pool-btn {
      border: none; border-radius: 8px; cursor: pointer; font-size: 1rem;
      font-weight: 700; padding: 10px 24px; transition: background 0.15s, transform 0.1s;
    }
    .pool-btn:active { transform: scale(0.97); }
    .pool-btn-primary { background: #1a6b3c; color: #fff; }
    .pool-btn-primary:hover { background: #228a4e; }
    .pool-btn-secondary { background: rgba(255,255,255,0.1); color: #b0c4b1; border: 1px solid #1a6b3c; }
    .pool-btn-secondary:hover { background: rgba(255,255,255,0.17); }
    .pool-btn-xs { padding: 5px 12px; font-size: 0.82rem; }
    .pool-divider { height: 1px; background: #1a6b3c; width: 100%; opacity: 0.5; }
    .pool-local-label { font-size: 0.75rem; color: #5a8a6a; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; align-self: flex-start; }

    /* Room screen */
    .pool-room-code-label { color: #888; font-size: 0.82rem; letter-spacing: 0.1em; text-transform: uppercase; }
    .pool-room-code-row { display: flex; align-items: center; gap: 12px; }
    .pool-room-code { font-size: 2rem; font-weight: 900; letter-spacing: 0.25em; color: #d4a85a; }
    .pool-players { display: flex; gap: 18px; width: 100%; justify-content: center; }
    .pool-player-slot {
      flex: 1; border-radius: 10px; padding: 12px 16px; text-align: center;
      border: 1px solid #1a6b3c;
    }
    .pool-slot-filled { background: rgba(26,107,60,0.18); }
    .pool-slot-empty  { background: rgba(255,255,255,0.04); color: #555; }
    .pool-slot-label  { font-size: 0.75rem; color: #888; text-transform: uppercase; letter-spacing: 0.1em; }
    .pool-slot-name   { display: block; font-weight: 700; font-size: 1.05rem; margin-top: 4px; }
    .pool-waiting-msg { color: #888; font-size: 0.9rem; font-style: italic; }
    .pool-leave { margin-top: 6px; }

    /* HUD */
    .pool-hud-bar {
      position: absolute; top: 0; left: 0; right: 0;
      display: flex; align-items: stretch; background: rgba(5,15,5,0.85);
      border-bottom: 1.5px solid #1a6b3c; min-height: 58px;
    }
    .pool-hud-player {
      flex: 1; padding: 8px 14px; display: flex; flex-direction: column; justify-content: center;
      transition: background 0.2s;
    }
    .pool-hud-active { background: rgba(26,107,60,0.22); box-shadow: inset 0 0 0 1.5px #1a6b3c; }
    .pool-hud-name { font-weight: 700; font-size: 0.95rem; color: #e8f5e9; }
    .pool-hud-balls { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .pool-ball-dot {
      display: inline-block; width: 13px; height: 13px; border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.18); transition: opacity 0.3s;
    }
    .pool-ball-pocketed { opacity: 0.2; }
    .pool-hud-center {
      width: 160px; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .pool-turn-indicator { font-size: 0.78rem; font-weight: 800; letter-spacing: 0.08em; text-align: center; }
    .pool-my-turn  { color: #4eff8a; text-shadow: 0 0 8px rgba(78,255,138,0.5); }
    .pool-opp-turn { color: #666; }

    /* Message area */
    .pool-msg-area {
      position: absolute; top: 68px; left: 50%; transform: translateX(-50%);
      background: rgba(5,15,5,0.88); border: 1px solid #1a6b3c;
      border-radius: 20px; padding: 6px 22px; font-size: 0.9rem; color: #d4a85a;
      font-weight: 600; white-space: nowrap;
      transition: opacity 0.6s;
      display: none;
      pointer-events: none;
    }

    /* Power bar */
    .pool-power-bar-wrap {
      position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%);
      display: none; flex-direction: column; align-items: center; gap: 4px;
    }
    .pool-power-bar-bg {
      width: 240px; height: 12px; background: rgba(255,255,255,0.1);
      border-radius: 6px; overflow: hidden; border: 1px solid #1a6b3c;
    }
    .pool-power-bar-fill { height: 100%; border-radius: 6px; transition: width 0.05s, background 0.05s; }

    /* Result screen */
    .pool-result-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.72); display: flex; align-items: center; justify-content: center;
    }
    .pool-result-box {
      background: rgba(10,20,10,0.97); border: 1.5px solid #1a6b3c;
      border-radius: 16px; padding: 40px 52px;
      display: flex; flex-direction: column; align-items: center; gap: 16px;
      color: #e8f5e9; text-align: center; min-width: 300px;
    }
    .pool-result-icon  { font-size: 3.5rem; }
    .pool-result-title { font-size: 2rem; font-weight: 900; color: #d4a85a; }
    .pool-result-msg   { color: #b0c4b1; font-size: 0.95rem; }
  `;
  document.head.appendChild(style);
}

// ── Default export ─────────────────────────────────────────────────────────────
export default function poolInit({ canvas, context, name, kontra }) {
  injectStyles();

  // Overlay
  const container = canvas.parentElement || document.body;
  initUI(container);

  // Resize canvas to fit projected table
  canvas.width  = 1100;
  canvas.height = 640;

  // ── Local state ──────────────────────────────────────────────────────────────
  let localName    = '';
  let opponentName = '';
  let isHost       = false;
  let localMode    = false;
  let aiMode       = false;
  let aiShotTimer  = null;
  let ballInHand   = false;
  let pendingSnap  = null;
  let wasAllSleeping = true;

  const cueState = {
    visible: false, x: 0, y: 0, angle: 0, power: 0, dragging: false,
  };

  // Mouse/touch input
  let mouseDown = false;
  let dragStart = { x: 0, y: 0 };

  function isMyTurn() {
    if (gameState.phase !== 'playing') return false;
    if (localMode) return true;
    if (aiMode)    return gameState.currentTurn === 1;   // human is always P1 in AI mode
    return gameState.currentTurn === gameState.myPlayerNum;
  }

  // ── Physics callbacks ────────────────────────────────────────────────────────
  function handlePocketed(index) {
    onBallPocketed(index);
    playSound('pocket', 1.0);
  }

  function handleCollision(i, j, impulse) {
    if (i === 0 && j !== 0) onCueBallHit(j);
    else if (j === 0 && i !== 0) onCueBallHit(i);
    const vol = Math.min(impulse / 8, 1.0);
    if (vol > 0.05) playSound('ball_collision', vol);
  }

  function handleRailHit(index) {
    onBallRailHit(index);
    playSound('rail_hit', 0.5);
  }

  initPhysics(handlePocketed, handleCollision, handleRailHit);

  // ── Scoring callbacks ────────────────────────────────────────────────────────
  function handleFoul(reason) {
    showMessage('Foul! ' + reason);
  }

  function scheduleAiShot() {
    if (aiShotTimer) clearTimeout(aiShotTimer);
    aiShotTimer = setTimeout(() => {
      aiShotTimer = null;
      if (gameState.phase !== 'playing' || gameState.currentTurn !== 2 || !allSleeping()) return;

      if (ballInHand) {
        placeBall(0, BREAK_X, BREAK_Y);
        ballInHand = false;
        cueState.x = BREAK_X;
        cueState.y = BREAK_Y;
      }

      const shot = computeAiShot(gameState.players, 2);
      if (!shot) return;
      resetTurnState();
      applyShot(shot.power, shot.angle, 0, 0);
      playSound('cue_hit', 1.0);
      cueState.visible = false;
    }, 900 + Math.random() * 600);
  }

  function handleTurnSwitch(newTurn, grantBallInHand) {
    if (localMode) {
      ballInHand = grantBallInHand;
      updateHUDDisplay();
      const name = gameState.players[newTurn - 1].name;
      showMessage(grantBallInHand ? `${name}'s turn — Ball-in-hand` : `${name}'s turn`);
    } else if (aiMode) {
      ballInHand = grantBallInHand;
      updateHUDDisplay();
      if (newTurn === 2) {
        showMessage('CPU is thinking…');
        scheduleAiShot();
      } else {
        if (ballInHand) showMessage('Ball-in-hand — click to place cue ball');
      }
    } else {
      ballInHand = grantBallInHand && newTurn === gameState.myPlayerNum;
      updateHUDDisplay();
      if (ballInHand) showMessage('Ball-in-hand — click to place cue ball');
    }
    updateCueVisibility();
  }

  function handleGroupAssign(p1n, p1g, p2n, p2g) {
    showMessage(`${p1n}: ${p1g}  •  ${p2n}: ${p2g}`);
    updateHUDDisplay();
  }

  function handleGameEnd(winnerName, reason) {
    gameState.phase = 'ended';
    if (aiShotTimer) { clearTimeout(aiShotTimer); aiShotTimer = null; }
    stopMusic();
    if (localMode || aiMode) {
      showResultScreen(true, winnerName, reason, true);
    } else {
      const win = winnerName === localName;
      network.send({ type: 'game_over', winnerName, reason });
      showResultScreen(win, winnerName, reason, false);
    }
  }

  function handleMessage(msg) {
    if (msg) showMessage(msg);
  }

  initScoring({
    onFoul:        handleFoul,
    onTurnSwitch:  handleTurnSwitch,
    onGroupAssign: handleGroupAssign,
    onGameEnd:     handleGameEnd,
    onMessage:     handleMessage,
  });

  // ── Network message handlers ─────────────────────────────────────────────────
  network.on('join_room', (msg) => {
    if (!isHost) return;
    opponentName = msg.playerName;
    network.send({ type: 'room_confirm', playerName: localName });
    showScreen('room', {
      roomCode: network.getRoomCode(), localName, opponentName, isHost,
      onStart: startGame, onLeave: leaveRoom,
    });
  });

  network.on('room_confirm', (msg) => {
    if (isHost) return;
    opponentName = msg.playerName;
    showScreen('room', {
      roomCode: network.getRoomCode(), localName, opponentName, isHost: false,
      onStart: null, onLeave: leaveRoom,
    });
  });

  network.on('start_game', (msg) => {
    if (gameState.phase === 'playing') return; // host already initialized via startGame()
    const myNum = isHost ? 1 : 2;
    const p1    = isHost ? localName : opponentName;
    const p2    = isHost ? opponentName : localName;
    initGameState(myNum, p1, p2);
    setupRack();
    resetTurnState();
    startMusic();
    showScreen('hud', hudData());
    updateCueVisibility();
    network.startStateSync(getSnapshot);
  });

  network.on('opponent_shot', (msg) => {
    if (isMyTurn()) return; // shouldn't happen, but guard
    resetTurnState();
    applyShot(msg.power, msg.angle, msg.tipOffsetX, msg.tipOffsetY);
    cueState.visible = false;
  });

  network.on('state_sync', (msg) => {
    if (!msg.snapshot) return;
    if (allSleeping()) {
      applySnapshot(msg.snapshot);
    } else {
      pendingSnap = msg.snapshot;
    }
  });

  network.on('game_over', (msg) => {
    if (gameState.phase === 'ended') return;
    gameState.phase = 'ended';
    const win = msg.winnerName !== localName;
    stopMusic();
    showResultScreen(win, msg.winnerName, msg.reason);
  });

  network.on('opponent_left', () => {
    if (gameState.phase === 'ended') return;
    gameState.phase = 'ended';
    stopMusic();
    showResultScreen(true, localName, 'Opponent disconnected');
  });

  network.on('play_again', () => {
    // Reset game state while preserving player names
    gameState.players[0].pocketed = []; gameState.players[0].group = null;
    gameState.players[1].pocketed = []; gameState.players[1].group = null;
    gameState.breakTaken  = false;
    gameState.phase       = 'playing';
    gameState.currentTurn = 1;
    setupRack();
    resetTurnState();
    startMusic();
    cueState.visible  = false;
    cueState.dragging = false;
    wasAllSleeping    = true;
    showScreen('hud', hudData());
    updateCueVisibility();
  });

  network.on('error', (msg) => {
    showMessage('Error: ' + (msg.message || ''));
  });

  // ── Connect ──────────────────────────────────────────────────────────────────
  network.connect(
    () => console.log('[pool] WebSocket connected'),
    () => console.log('[pool] WebSocket disconnected'),
  );

  // ── UI flow ───────────────────────────────────────────────────────────────────
  showLobbyScreen();

  function startGame() {
    network.send({ type: 'start_game' });
    const myNum = 1;
    initGameState(myNum, localName, opponentName);
    setupRack();
    resetTurnState();
    startMusic();
    showScreen('hud', hudData());
    updateCueVisibility();
    network.startStateSync(getSnapshot);
  }

  function startLocalGame(p1Name, p2Name) {
    localMode = true;
    aiMode    = false;
    localName = p1Name;
    opponentName = p2Name;
    initGameState(1, p1Name, p2Name);
    setupRack();
    resetTurnState();
    startMusic();
    showScreen('hud', hudData());
    showMessage(`${p1Name}'s turn`);
    updateCueVisibility();
  }

  function startAiGame(p1Name) {
    aiMode    = true;
    localMode = false;
    localName = p1Name;
    opponentName = 'CPU';
    initGameState(1, p1Name, 'CPU');
    setupRack();
    resetTurnState();
    startMusic();
    showScreen('hud', hudData());
    showMessage(`${p1Name}'s turn`);
    updateCueVisibility();
  }

  function goToLobby() {
    if (aiShotTimer) { clearTimeout(aiShotTimer); aiShotTimer = null; }
    network.setRoomCode(null);
    network.stopStateSync();
    gameState.phase = 'lobby';
    opponentName = '';
    localMode = false;
    aiMode    = false;
    showLobbyScreen();
  }

  function leaveRoom() {
    goToLobby();
  }

  function showLobbyScreen() {
    showScreen('lobby', {
      onCreateRoom: (pName) => {
        localName = pName;
        isHost = true;
        const code = network.createRoom(pName);
        showScreen('room', { roomCode: code, localName, opponentName: null, isHost, onStart: startGame, onLeave: leaveRoom });
      },
      onJoinRoom: (pName, code) => {
        localName = pName;
        isHost = false;
        network.joinRoom(code, pName);
        showScreen('room', { roomCode: code, localName, opponentName: null, isHost, onStart: null, onLeave: leaveRoom });
      },
      onPlayLocal: (p1Name, p2Name) => {
        startLocalGame(p1Name, p2Name);
      },
      onPlayVsAI: (p1Name) => {
        startAiGame(p1Name);
      },
    });
  }

  function showResultScreen(win, winnerName, reason, isLocal = false) {
    showScreen('result', {
      win,
      title: isLocal ? `${winnerName} Wins!` : (win ? 'You Win!' : `${winnerName} Wins!`),
      message: reason || '',
      onPlayAgain: () => {
        if (isLocal) {
          gameState.players[0].pocketed = []; gameState.players[0].group = null;
          gameState.players[1].pocketed = []; gameState.players[1].group = null;
          gameState.breakTaken  = false;
          gameState.phase       = 'playing';
          gameState.currentTurn = 1;
          setupRack();
          resetTurnState();
          startMusic();
          cueState.visible  = false;
          cueState.dragging = false;
          wasAllSleeping    = true;
          showScreen('hud', hudData());
          showMessage(`${gameState.players[0].name}'s turn`);
          updateCueVisibility();
        } else {
          network.send({ type: 'play_again' });
        }
      },
      onMainMenu: () => {
        stopMusic();
        goToLobby();
      },
    });
  }

  // ── HUD data helper ───────────────────────────────────────────────────────────
  function hudData() {
    return {
      players:      gameState.players,
      currentTurn:  gameState.currentTurn,
      myPlayerNum:  gameState.myPlayerNum,
      localMode,
      aiMode,
      powerVisible: false,
      powerPct:     0,
    };
  }

  function updateHUDDisplay() {
    const el = document.getElementById('pool-screen-hud');
    if (el && el.style.display !== 'none') showScreen('hud', hudData());
  }

  // ── Cue visibility ────────────────────────────────────────────────────────────
  function updateCueVisibility() {
    if (gameState.phase !== 'playing') { cueState.visible = false; return; }
    if (isMyTurn() && allSleeping()) {
      const cb = getBallState(0);
      if (cb.active) {
        cueState.visible = true;
        cueState.x = cb.x;
        cueState.y = cb.y;
      }
    } else {
      cueState.visible = false;
    }
  }

  // ── Ball-in-hand cue placement ────────────────────────────────────────────────
  const MIN_BIH_X = RAIL_THICKNESS + BALL_RADIUS + 2;
  const MAX_BIH_X = TABLE_WIDTH  - RAIL_THICKNESS - BALL_RADIUS - 2;
  const MIN_BIH_Y = RAIL_THICKNESS + BALL_RADIUS + 2;
  const MAX_BIH_Y = TABLE_HEIGHT - RAIL_THICKNESS - BALL_RADIUS - 2;

  function placeCueBallAt(screenX, screenY) {
    const logical = reverseProject(screenX, screenY);
    let lx = Math.max(MIN_BIH_X, Math.min(MAX_BIH_X, logical.x));
    let ly = Math.max(MIN_BIH_Y, Math.min(MAX_BIH_Y, logical.y));

    // Avoid overlap with other balls
    for (let i = 1; i < 16; i++) {
      if (!active[i]) continue;
      const dx = lx - posX[i];
      const dy = ly - posY[i];
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < BALL_RADIUS * 2.1) {
        const nx = dx / dist || 1;
        const ny = dy / dist || 0;
        lx = posX[i] + nx * BALL_RADIUS * 2.1;
        ly = posY[i] + ny * BALL_RADIUS * 2.1;
        lx = Math.max(MIN_BIH_X, Math.min(MAX_BIH_X, lx));
        ly = Math.max(MIN_BIH_Y, Math.min(MAX_BIH_Y, ly));
      }
    }

    placeBall(0, lx, ly);
    ballInHand = false;
    cueState.x = lx;
    cueState.y = ly;
    cueState.visible = true;
    showMessage('');
  }

  // ── Input handlers ────────────────────────────────────────────────────────────
  function getEventPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top)  * scaleY,
    };
  }

  function onPointerMove(e) {
    if (gameState.phase !== 'playing') return;
    if (!isMyTurn() || !allSleeping()) return;

    const pos = getEventPos(e);

    if (ballInHand) return; // don't update angle while placing

    const cb = getBallState(0);
    if (!cb.active) return;
    const sp = project(cb.x, cb.y);
    const dx = pos.x - sp.x;
    const dy = pos.y - sp.y;
    cueState.angle = Math.atan2(dy, dx) + Math.PI;
    cueState.x = cb.x;
    cueState.y = cb.y;

    if (mouseDown) {
      const distDragged = Math.hypot(pos.x - dragStart.x, pos.y - dragStart.y);
      cueState.power  = Math.min(distDragged * CUE_POWER_RATE, CUE_MAX_POWER);
      cueState.dragging = true;
      const pct = cueState.power / CUE_MAX_POWER;
      updatePowerBar(true, pct);
    }
  }

  function onPointerDown(e) {
    if (gameState.phase !== 'playing') return;
    if (!isMyTurn()) return;

    const pos = getEventPos(e);

    if (ballInHand) {
      placeCueBallAt(pos.x, pos.y);
      return;
    }

    if (!allSleeping()) return;
    mouseDown = true;
    dragStart = { ...pos };
    cueState.power   = 0;
    cueState.dragging = false;
  }

  function onPointerUp(e) {
    if (!mouseDown) return;
    mouseDown = false;

    if (!isMyTurn() || !allSleeping() || gameState.phase !== 'playing') return;
    if (ballInHand) return;

    if (cueState.dragging && cueState.power >= CUE_MIN_POWER) {
      fireShot();
    }
    cueState.dragging = false;
    cueState.power    = 0;
    updatePowerBar(false, 0);
  }

  function fireShot() {
    const angle  = cueState.angle;
    const power  = cueState.power;
    const tipX   = 0;
    const tipY   = 0;

    resetTurnState();
    applyShot(power, angle, tipX, tipY);
    if (!localMode) network.sendShot(angle, power, tipX, tipY);
    playSound('cue_hit', 1.0);
    cueState.visible  = false;
    cueState.dragging = false;
    cueState.power    = 0;
    updatePowerBar(false, 0);
  }

  // Attach events
  canvas.addEventListener('mousemove',  onPointerMove);
  canvas.addEventListener('mousedown',  onPointerDown);
  canvas.addEventListener('mouseup',    onPointerUp);
  canvas.addEventListener('touchmove',  (e) => { e.preventDefault(); onPointerMove(e); }, { passive: false });
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onPointerDown(e); }, { passive: false });
  canvas.addEventListener('touchend',   (e) => { e.preventDefault(); onPointerUp(e);   }, { passive: false });

  // ── Kontra Scene ──────────────────────────────────────────────────────────────
  const { Scene } = kontra;

  const scene = Scene({ id: name });

  scene.update = function(dt) {
    if (gameState.phase !== 'playing') return;

    const prevSleeping = wasAllSleeping;
    updatePhysics(dt);
    const nowSleeping = allSleeping();

    // Detect transition: balls were moving, now all stopped → resolve turn.
    // Both clients run resolveTurn() — physics callbacks (firstBallHit etc.)
    // are populated by the physics simulation on each client independently.
    if (!prevSleeping && nowSleeping) {
      if (pendingSnap) { applySnapshot(pendingSnap); pendingSnap = null; }
      resolveTurn();
      updateHUDDisplay();
      updateCueVisibility();
    }

    wasAllSleeping = nowSleeping;

    if (!nowSleeping) {
      cueState.visible = false;  // guarantee cue is hidden while any ball is rolling
      const cb = getBallState(0);
      if (cb.active) { cueState.x = cb.x; cueState.y = cb.y; }
    }
  };

  scene.render = function() {
    renderFrame(context, cueState);
  };

  return scene;
}
