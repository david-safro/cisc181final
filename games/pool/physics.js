import {
  BALL_RADIUS, RESTITUTION, ROLLING_FRICTION, SPIN_DECAY, SPIN_GRIP,
  SLEEP_SPEED_SQ, FIXED_DT, MAX_STEPS_PER_FRAME,
  SPATIAL_CELL_SIZE, BAUMGARTE, PENETRATION_SLOP,
  POCKETS, POCKET_MOUTH_RADIUS, TABLE_WIDTH, TABLE_HEIGHT, RAIL_THICKNESS,
  RACK_X, RACK_Y, BREAK_X, BREAK_Y, CUE_SPIN_FACTOR,
} from './constants.js';

const N = 16;
export const posX    = new Float32Array(N);
export const posY    = new Float32Array(N);
export const velX    = new Float32Array(N);
export const velY    = new Float32Array(N);
export const spinX   = new Float32Array(N);
export const spinY   = new Float32Array(N);
export const active  = new Uint8Array(N);
export const sleeping = new Uint8Array(N);

let accumulator = 0;
let cbPocketed  = null;
let cbCollision = null;
let cbRailHit   = null;

export function initPhysics(onPocketed, onCollision, onRailHit) {
  cbPocketed  = onPocketed;
  cbCollision = onCollision;
  cbRailHit   = onRailHit;
  posX.fill(0); posY.fill(0);
  velX.fill(0); velY.fill(0);
  spinX.fill(0); spinY.fill(0);
  active.fill(0); sleeping.fill(0);
  accumulator = 0;
}

export function placeBall(index, x, y) {
  posX[index] = x; posY[index] = y;
  velX[index] = 0; velY[index] = 0;
  spinX[index] = 0; spinY[index] = 0;
  active[index]   = 1;
  sleeping[index] = 1;
}

export function setupRack() {
  const dx = BALL_RADIUS * 2 + 0.5;
  const dy = (BALL_RADIUS * 2 + 0.5) * (Math.sqrt(3) / 2);

  const rackOrder = [
    [1],
    [2, 9],
    [3, 8, 10],
    [4, 11, 5, 12],
    [6, 13, 7, 14, 15],
  ];

  for (let row = 0; row < rackOrder.length; row++) {
    const rowBalls = rackOrder[row];
    for (let col = 0; col < rowBalls.length; col++) {
      const bi = rowBalls[col];
      const x = RACK_X + row * dx;
      const y = RACK_Y + (col - (rowBalls.length - 1) / 2) * dy;
      placeBall(bi, x, y);
    }
  }

  placeBall(0, BREAK_X, BREAK_Y);
  for (let i = 0; i < N; i++) sleeping[i] = 1;
}

export function applyShot(power, angle, tipOffsetX, tipOffsetY) {
  if (!active[0] || !allSleeping()) return false;
  velX[0]    = Math.cos(angle) * power;
  velY[0]    = Math.sin(angle) * power;
  spinX[0]   = tipOffsetY * power * CUE_SPIN_FACTOR;
  spinY[0]   = tipOffsetX * power * CUE_SPIN_FACTOR;
  sleeping[0] = 0;
  return true;
}

export function allSleeping() {
  for (let i = 0; i < N; i++) {
    if (active[i] && !sleeping[i]) return false;
  }
  return true;
}

export function updatePhysics(frameDeltaSeconds) {
  accumulator += frameDeltaSeconds;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
    step();
    accumulator -= FIXED_DT;
    steps++;
  }
}

export function getSnapshot() {
  return {
    posX:    Array.from(posX),    posY:    Array.from(posY),
    velX:    Array.from(velX),    velY:    Array.from(velY),
    spinX:   Array.from(spinX),   spinY:   Array.from(spinY),
    active:  Array.from(active),  sleeping: Array.from(sleeping),
  };
}

export function applySnapshot(snap) {
  for (let i = 0; i < N; i++) {
    posX[i]     = snap.posX[i];    posY[i]     = snap.posY[i];
    velX[i]     = snap.velX[i];    velY[i]     = snap.velY[i];
    spinX[i]    = snap.spinX[i];   spinY[i]    = snap.spinY[i];
    active[i]   = snap.active[i];  sleeping[i] = snap.sleeping[i];
  }
}

export function getActiveBalls() {
  const result = [];
  for (let i = 0; i < N; i++) {
    if (active[i]) result.push({ index: i, x: posX[i], y: posY[i] });
  }
  return result;
}

export function getBallState(index) {
  return { x: posX[index], y: posY[index], vx: velX[index], vy: velY[index], active: active[index] };
}

// ── Spatial hash ──────────────────────────────────────────────────────────────
// KEY FIX: include sleeping balls so the cue ball detects rack collisions.
function buildSpatialHash() {
  const map = new Map();
  const add = (key, i) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(i);
  };
  for (let i = 0; i < N; i++) {
    if (!active[i]) continue;                       // pocketed balls excluded
    // sleeping balls ARE included — they are stationary targets
    const cx = Math.floor(posX[i] / SPATIAL_CELL_SIZE);
    const cy = Math.floor(posY[i] / SPATIAL_CELL_SIZE);
    for (let ddx = -1; ddx <= 1; ddx++) {
      for (let ddy = -1; ddy <= 1; ddy++) {
        add(((cx + ddx) * 10000 + (cy + ddy)) | 0, i);
      }
    }
  }
  return map;
}

function getCandidatePairs() {
  const map = buildSpatialHash();
  const seen = new Set();
  const pairs = [];
  for (const list of map.values()) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const ia = list[a], ib = list[b];
        if (sleeping[ia] && sleeping[ib]) continue;   // both stationary → skip
        const key = ia < ib ? ia * 100 + ib : ib * 100 + ia;
        if (!seen.has(key)) { seen.add(key); pairs.push([ia, ib]); }
      }
    }
  }
  return pairs;
}

// ── Narrow phase ──────────────────────────────────────────────────────────────
function resolveCollision(i, j) {
  const dx = posX[j] - posX[i];
  const dy = posY[j] - posY[i];
  const distSq = dx * dx + dy * dy;
  const minDist = BALL_RADIUS * 2;
  const minDistSq = minDist * minDist;
  if (distSq >= minDistSq || distSq === 0) return;

  const dist = Math.sqrt(distSq);
  const nx = dx / dist;
  const ny = dy / dist;

  // Relative velocity (j relative to i) projected onto collision normal
  const rvx = velX[j] - velX[i];
  const rvy = velY[j] - velY[i];
  const vn  = rvx * nx + rvy * ny;
  if (vn > 0) return;                               // already separating

  // Impulse (equal-mass symmetric)
  const impulse = -(1 + RESTITUTION) * vn * 0.5;
  velX[i] -= impulse * nx; velY[i] -= impulse * ny;
  velX[j] += impulse * nx; velY[j] += impulse * ny;

  // Positional correction (Baumgarte) to prevent sinking
  const pen = minDist - dist;
  if (pen > PENETRATION_SLOP) {
    const corr = (pen - PENETRATION_SLOP) * BAUMGARTE * 0.5;
    posX[i] -= nx * corr; posY[i] -= ny * corr;
    posX[j] += nx * corr; posY[j] += ny * corr;
  }

  sleeping[i] = 0; sleeping[j] = 0;
  if (cbCollision) cbCollision(i, j, Math.abs(impulse));
}

// ── Rails ─────────────────────────────────────────────────────────────────────
const MIN_X = RAIL_THICKNESS + BALL_RADIUS;
const MAX_X = TABLE_WIDTH  - RAIL_THICKNESS - BALL_RADIUS;
const MIN_Y = RAIL_THICKNESS + BALL_RADIUS;
const MAX_Y = TABLE_HEIGHT - RAIL_THICKNESS - BALL_RADIUS;

function resolveRails() {
  for (let i = 0; i < N; i++) {
    if (!active[i] || sleeping[i]) continue;
    let hit = false;
    if (posX[i] < MIN_X) { posX[i] = MIN_X; velX[i] =  Math.abs(velX[i]) * RESTITUTION; hit = true; }
    else if (posX[i] > MAX_X) { posX[i] = MAX_X; velX[i] = -Math.abs(velX[i]) * RESTITUTION; hit = true; }
    if (posY[i] < MIN_Y) { posY[i] = MIN_Y; velY[i] =  Math.abs(velY[i]) * RESTITUTION; hit = true; }
    else if (posY[i] > MAX_Y) { posY[i] = MAX_Y; velY[i] = -Math.abs(velY[i]) * RESTITUTION; hit = true; }
    if (hit && cbRailHit) cbRailHit(i);
  }
}

// ── Pockets ───────────────────────────────────────────────────────────────────
function checkPockets() {
  for (let i = 0; i < N; i++) {
    if (!active[i] || sleeping[i]) continue;
    for (const p of POCKETS) {
      const dx = posX[i] - p.x;
      const dy = posY[i] - p.y;
      if (dx * dx + dy * dy < POCKET_MOUTH_RADIUS * POCKET_MOUTH_RADIUS) {
        active[i]   = 0;
        sleeping[i] = 1;
        velX[i] = velY[i] = spinX[i] = spinY[i] = 0;
        if (cbPocketed) cbPocketed(i);
        break;
      }
    }
  }
}

// ── Single ball integration ───────────────────────────────────────────────────
function integrateOne(i) {
  if (!active[i] || sleeping[i]) return;
  // Spin grip (side/top spin bleeds into linear velocity)
  velX[i] += (spinX[i] - velX[i]) * SPIN_GRIP;
  velY[i] += (spinY[i] - velY[i]) * SPIN_GRIP;
  spinX[i] *= SPIN_DECAY;
  spinY[i] *= SPIN_DECAY;
  // Rolling friction
  velX[i] *= ROLLING_FRICTION;
  velY[i] *= ROLLING_FRICTION;
  // Integrate position
  posX[i] += velX[i];
  posY[i] += velY[i];
  // Sleep check
  if (velX[i] * velX[i] + velY[i] * velY[i] < SLEEP_SPEED_SQ) {
    velX[i] = velY[i] = spinX[i] = spinY[i] = 0;
    sleeping[i] = 1;
  }
}

// ── Step ──────────────────────────────────────────────────────────────────────
function step() {
  // 1. Integrate all awake balls
  for (let i = 0; i < N; i++) integrateOne(i);

  // 2. Collision passes — pairs are RECOMPUTED each pass so newly-woken rack
  //    balls are included in subsequent passes (cascade propagation fix).
  for (let pass = 0; pass < 6; pass++) {
    const pairs = getCandidatePairs();
    for (const [i, j] of pairs) resolveCollision(i, j);
  }

  // 3. Pocket check BEFORE rail so a ball near a pocket sinks rather than bounces
  checkPockets();

  // 4. Rail bounce
  resolveRails();

  // 5. One final collision pass: a rail bounce can push a ball into a neighbour
  const finalPairs = getCandidatePairs();
  for (const [i, j] of finalPairs) resolveCollision(i, j);
}
