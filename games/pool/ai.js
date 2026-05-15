import { posX, posY, active } from './physics.js';
import {
  BALL_RADIUS, POCKETS, POCKET_MOUTH_RADIUS, SOLIDS, STRIPES, EIGHT_BALL,
  TABLE_WIDTH, TABLE_HEIGHT, RAIL_THICKNESS,
  CUE_MIN_POWER, CUE_MAX_POWER,
} from './constants.js';

const D = BALL_RADIUS * 2;
const MARGIN = RAIL_THICKNESS + BALL_RADIUS + 2;

// True if no active ball (except those in `skip`) lies within D of the segment A→B.
function isPathClear(ax, ay, bx, by, skip) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1) return true;
  for (let i = 0; i < 16; i++) {
    if (!active[i] || skip.includes(i)) continue;
    const t  = Math.max(0, Math.min(1, ((posX[i] - ax) * dx + (posY[i] - ay) * dy) / len2));
    const ex = ax + t * dx - posX[i];
    const ey = ay + t * dy - posY[i];
    if (ex * ex + ey * ey < D * D) return false;
  }
  return true;
}

// Rough check: does the cue ball's path toward the ghost ball continue into a pocket?
function cueBallScratchRisk(cx, cy, gx, gy) {
  const dx = gx - cx, dy = gy - cy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len, ny = dy / len;
  const limit = POCKET_MOUTH_RADIUS * POCKET_MOUTH_RADIUS * 3;
  for (const p of POCKETS) {
    const t = Math.max(0, (p.x - gx) * nx + (p.y - gy) * ny);
    const ex = gx + t * nx - p.x;
    const ey = gy + t * ny - p.y;
    if (ex * ex + ey * ey < limit) return true;
  }
  return false;
}

// Reward shots that leave the cue ball near the table center (good position).
function cuePositionBonus(gx, gy) {
  const cx = TABLE_WIDTH / 2, cy = TABLE_HEIGHT / 2;
  const dist = Math.hypot(gx - cx, gy - cy);
  return Math.max(0, 120 - dist * 0.35);
}

function scoreShot(cueDist, ballDist, cutAngle, gx, gy) {
  return (
    1500
    - cueDist * 0.5
    - ballDist * 0.4
    - Math.abs(cutAngle) * 85
    + cuePositionBonus(gx, gy)
  );
}

// difficulty: 'easy' | 'medium' | 'hard'
export function computeAiShot(players, currentTurn, difficulty = 'medium') {
  const group = players[currentTurn - 1].group;

  let targets;
  if (!group) {
    targets = [...SOLIDS, ...STRIPES].filter(i => active[i]);
  } else {
    const own = (group === 'solids' ? SOLIDS : STRIPES).filter(i => active[i]);
    targets  = own.length ? own : (active[EIGHT_BALL] ? [EIGHT_BALL] : []);
  }

  const cx = posX[0], cy = posY[0];
  let best = null, bestScore = -Infinity;

  // Easy AI only attempts shots within ≈45° cut; medium/hard attempt anything.
  const maxCut = difficulty === 'easy' ? Math.PI / 4 : Math.PI / 2;

  for (const bi of targets) {
    if (!active[bi]) continue;
    const bx = posX[bi], by = posY[bi];

    for (const p of POCKETS) {
      const pdx   = p.x - bx, pdy = p.y - by;
      const pdist = Math.hypot(pdx, pdy);
      if (pdist < 1) continue;
      const pnx = pdx / pdist, pny = pdy / pdist;

      const gx = bx - pnx * D, gy = by - pny * D;

      if (gx < MARGIN || gx > TABLE_WIDTH - MARGIN || gy < MARGIN || gy > TABLE_HEIGHT - MARGIN) continue;
      if (!isPathClear(cx, cy, gx, gy, [0, bi])) continue;
      if (!isPathClear(bx, by, p.x, p.y, [bi]))  continue;

      const cueDist  = Math.hypot(gx - cx, gy - cy);
      const aimDx = gx - cx, aimDy = gy - cy;
      const aimLen = Math.hypot(aimDx, aimDy) || 1;
      const cutAngle = Math.acos(Math.max(-1, Math.min(1,
        (aimDx / aimLen) * pnx + (aimDy / aimLen) * pny
      )));

      if (cutAngle > maxCut) continue;

      // Hard AI avoids shots that risk a scratch.
      if (difficulty === 'hard' && cueBallScratchRisk(cx, cy, gx, gy)) continue;

      const s = scoreShot(cueDist, pdist, cutAngle, gx, gy);
      if (s > bestScore) {
        bestScore = s;
        const angle = Math.atan2(gy - cy, gx - cx);
        // Tune power so cue ball arrives with authority but doesn't over-run.
        const rawPower = cueDist / 36 + pdist / 60;
        const cap      = difficulty === 'hard' ? 0.78 : 0.85;
        const power    = Math.min(Math.max(rawPower, CUE_MIN_POWER), CUE_MAX_POWER * cap);
        best = { angle, power };
      }
    }
  }

  // Fallback: aim at the nearest target ball, angled slightly to avoid a scratch.
  if (!best && targets.length > 0) {
    let nearest = targets[0], nearDist = Infinity;
    for (const i of targets) {
      const d = Math.hypot(posX[i] - cx, posY[i] - cy);
      if (d < nearDist) { nearDist = d; nearest = i; }
    }
    const baseAngle = Math.atan2(posY[nearest] - cy, posX[nearest] - cx);
    const offset    = difficulty === 'hard' ? 0.08 : 0;
    const power     = difficulty === 'easy' ? 4 : 6;
    best = { angle: baseAngle + offset, power };
  }

  // Aiming noise varies by difficulty.
  const noise = difficulty === 'easy' ? 0.26 : difficulty === 'hard' ? 0.032 : 0.105;
  if (best) best.angle += (Math.random() - 0.5) * noise;

  return best;
}
