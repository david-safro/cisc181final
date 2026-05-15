import { posX, posY, active } from './physics.js';
import {
  BALL_RADIUS, POCKETS, SOLIDS, STRIPES, EIGHT_BALL,
  TABLE_WIDTH, TABLE_HEIGHT, RAIL_THICKNESS,
  CUE_MIN_POWER, CUE_MAX_POWER,
} from './constants.js';

const D = BALL_RADIUS * 2;           // ball diameter (contact distance)
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

// Score a candidate shot.  Higher = better.
function scoreShot(cueDist, ballDist, cutAngle) {
  // Penalise long distance and steep cut angles (hard shots).
  return 1500 - cueDist * 0.5 - ballDist * 0.4 - Math.abs(cutAngle) * 80;
}

export function computeAiShot(players, currentTurn) {
  const group = players[currentTurn - 1].group;

  // Work out which balls this player should target.
  let targets;
  if (!group) {
    targets = [...SOLIDS, ...STRIPES].filter(i => active[i]);
  } else {
    const own = (group === 'solids' ? SOLIDS : STRIPES).filter(i => active[i]);
    targets  = own.length ? own : (active[EIGHT_BALL] ? [EIGHT_BALL] : []);
  }

  const cx = posX[0], cy = posY[0];
  let best = null, bestScore = -Infinity;

  for (const bi of targets) {
    if (!active[bi]) continue;
    const bx = posX[bi], by = posY[bi];

    for (const p of POCKETS) {
      // Direction target ball must travel to reach this pocket.
      const pdx   = p.x - bx, pdy = p.y - by;
      const pdist = Math.hypot(pdx, pdy);
      if (pdist < 1) continue;
      const pnx = pdx / pdist, pny = pdy / pdist;

      // Ghost-ball position: where cue centre must be at impact.
      const gx = bx - pnx * D, gy = by - pny * D;

      // Ghost ball must fit on the table.
      if (gx < MARGIN || gx > TABLE_WIDTH - MARGIN || gy < MARGIN || gy > TABLE_HEIGHT - MARGIN) continue;

      // Both paths must be unobstructed.
      if (!isPathClear(cx, cy, gx, gy, [0, bi])) continue;
      if (!isPathClear(bx, by, p.x, p.y, [bi]))  continue;

      const cueDist  = Math.hypot(gx - cx, gy - cy);

      // Cut angle: 0 = straight-on, π/2 = 90° cut (very hard).
      const aimDx = gx - cx, aimDy = gy - cy;
      const aimLen = Math.hypot(aimDx, aimDy) || 1;
      const cutAngle = Math.acos(Math.max(-1, Math.min(1,
        (aimDx / aimLen) * pnx + (aimDy / aimLen) * pny
      )));

      const s = scoreShot(cueDist, pdist, cutAngle);
      if (s > bestScore) {
        bestScore = s;
        const angle = Math.atan2(gy - cy, gx - cx);
        // Power: enough to reach the ghost ball and send the target to the pocket.
        const rawPower = cueDist / 38 + pdist / 65;
        const power    = Math.min(Math.max(rawPower, CUE_MIN_POWER), CUE_MAX_POWER * 0.85);
        best = { angle, power };
      }
    }
  }

  // Fallback safety play: aim at the nearest target ball with moderate pace.
  if (!best && targets.length > 0) {
    let nearest = targets[0], nearDist = Infinity;
    for (const i of targets) {
      const d = Math.hypot(posX[i] - cx, posY[i] - cy);
      if (d < nearDist) { nearDist = d; nearest = i; }
    }
    const angle = Math.atan2(posY[nearest] - cy, posX[nearest] - cx);
    best = { angle, power: 5 };
  }

  // Medium difficulty: ≈ ±3° aiming noise.
  if (best) best.angle += (Math.random() - 0.5) * 0.105;

  return best;
}
