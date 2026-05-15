import { SOLIDS, STRIPES, CUE_BALL, EIGHT_BALL } from './constants.js';

export const gameState = {
  phase: 'lobby',
  myPlayerNum: 1,
  currentTurn: 1,
  breakTaken: false,
  players: [
    { name: '', group: null, pocketed: [] },
    { name: '', group: null, pocketed: [] },
  ],
};

export const turnState = {
  firstBallHit:            null,
  ballsPocketedThisTurn:   [],
  railContactAfterHit:     false,
  foulOccurred:            false,
  foulReason:              null,
};

let _onFoul        = null;
let _onTurnSwitch  = null;
let _onGroupAssign = null;
let _onGameEnd     = null;
let _onMessage     = null;

export function initScoring({ onFoul, onTurnSwitch, onGroupAssign, onGameEnd, onMessage }) {
  _onFoul        = onFoul;
  _onTurnSwitch  = onTurnSwitch;
  _onGroupAssign = onGroupAssign;
  _onGameEnd     = onGameEnd;
  _onMessage     = onMessage;
}

export function resetTurnState() {
  turnState.firstBallHit          = null;
  turnState.ballsPocketedThisTurn = [];
  turnState.railContactAfterHit   = false;
  turnState.foulOccurred          = false;
  turnState.foulReason            = null;
}

export function onCueBallHit(otherIndex) {
  if (turnState.firstBallHit === null) turnState.firstBallHit = otherIndex;
}

export function onBallRailHit(_ballIndex) {
  if (turnState.firstBallHit !== null) turnState.railContactAfterHit = true;
}

export function onBallPocketed(ballIndex) {
  turnState.ballsPocketedThisTurn.push(ballIndex);
}

function shooterIndex()  { return gameState.currentTurn - 1; }
function opponentIndex() { return 2 - gameState.currentTurn; }

function ballGroup(index) {
  if (SOLIDS.includes(index))  return 'solids';
  if (STRIPES.includes(index)) return 'stripes';
  return null;
}

function countOwnGroup(player) {
  if (!player.group) return 0;
  return player.pocketed.filter(i => ballGroup(i) === player.group).length;
}

const GROUP_SIZE = 7; // 7 solids, 7 stripes

export function resolveTurn() {
  const pocketed  = turnState.ballsPocketedThisTurn;
  const first     = turnState.firstBallHit;
  const shooter   = gameState.players[shooterIndex()];
  const opponent  = gameState.players[opponentIndex()];
  const sg        = shooter.group; // assigned group, or null if not yet assigned

  // ── Foul checks ──────────────────────────────────────────────────────────────
  let foul = null;

  if (pocketed.includes(CUE_BALL)) {
    foul = 'Scratch! Ball-in-hand for your opponent.';
  } else if (first === null) {
    foul = 'No ball hit! Ball-in-hand for your opponent.';
  } else if (sg !== null && first !== EIGHT_BALL && ballGroup(first) !== sg) {
    foul = 'Wrong group hit first! Ball-in-hand for your opponent.';
  } else if (sg !== null && first === EIGHT_BALL && countOwnGroup(shooter) < GROUP_SIZE) {
    foul = 'Eight ball hit too early! Ball-in-hand for your opponent.';
  } else if (pocketed.length === 0 && !turnState.railContactAfterHit) {
    foul = 'No rail contact after hit! Ball-in-hand for your opponent.';
  }

  if (foul) {
    turnState.foulOccurred = true;
    turnState.foulReason   = foul;
    if (_onFoul) _onFoul(foul);
    switchTurn(true);
    return;
  }

  // ── Eight ball win/loss check ─────────────────────────────────────────────────
  if (pocketed.includes(EIGHT_BALL)) {
    const cleared   = countOwnGroup(shooter) >= GROUP_SIZE;
    const scratched = pocketed.includes(CUE_BALL);
    if (!cleared || scratched) {
      const reason = scratched ? 'Scratch on 8-ball!' : 'Eight ball pocketed early!';
      if (_onGameEnd) _onGameEnd(opponent.name, reason);
    } else {
      if (_onGameEnd) _onGameEnd(shooter.name, 'Eight ball legally pocketed!');
    }
    return;
  }

  // ── Record pocketed balls, assign groups ──────────────────────────────────────
  // Use a local variable so group assignment only happens once per turn
  let currentGroup = sg;
  const ownGroupPocketed = [];

  for (const bi of pocketed) {
    if (bi === CUE_BALL || bi === EIGHT_BALL) continue;
    const g = ballGroup(bi);
    if (g === null) continue;

    // Assign groups on first legal non-8 non-cue pocket (once only)
    if (currentGroup === null) {
      currentGroup    = g;
      shooter.group   = g;
      opponent.group  = g === 'solids' ? 'stripes' : 'solids';
      if (_onGroupAssign) _onGroupAssign(shooter.name, g, opponent.name, opponent.group);
    }

    if (g === shooter.group) {
      ownGroupPocketed.push(bi);
      shooter.pocketed.push(bi);
    } else {
      opponent.pocketed.push(bi);
    }
  }

  gameState.breakTaken = true;

  if (ownGroupPocketed.length > 0) {
    if (_onMessage) _onMessage('Keep going!');
    resetTurnState();
    if (_onTurnSwitch) _onTurnSwitch(gameState.currentTurn, false);
  } else {
    if (_onMessage) _onMessage('');
    switchTurn(false);
  }
}

export function switchTurn(ballInHand) {
  gameState.currentTurn = gameState.currentTurn === 1 ? 2 : 1;
  resetTurnState();
  if (_onTurnSwitch) _onTurnSwitch(gameState.currentTurn, ballInHand);
}

export function initGameState(myNum, p1Name, p2Name) {
  gameState.phase        = 'playing';
  gameState.myPlayerNum  = myNum;
  gameState.currentTurn  = 1;
  gameState.breakTaken   = false;
  gameState.players[0]   = { name: p1Name, group: null, pocketed: [] };
  gameState.players[1]   = { name: p2Name, group: null, pocketed: [] };
  resetTurnState();
}
