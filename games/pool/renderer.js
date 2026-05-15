import {
  TABLE_WIDTH, TABLE_HEIGHT, RAIL_THICKNESS, FELT_COLOR, RAIL_COLOR,
  BALL_RADIUS, BALL_COLORS,
  PROJ_OFFSET_X, PROJ_OFFSET_Y,
  POCKETS, POCKET_MOUTH_RADIUS,
  CUE_LENGTH, CUE_TIP_WIDTH, CUE_MAX_POWER,
  STRIPES,
} from './constants.js';
import { getActiveBalls } from './physics.js';

// ── Projection: top-down, 1-to-1 mapping with canvas offset ──────────────────
export function project(x, y) {
  return { x: PROJ_OFFSET_X + x, y: PROJ_OFFSET_Y + y };
}

export function reverseProject(screenX, screenY) {
  return { x: screenX - PROJ_OFFSET_X, y: screenY - PROJ_OFFSET_Y };
}

export function getCanvasSize() {
  return {
    width:  TABLE_WIDTH  + PROJ_OFFSET_X * 2,
    height: TABLE_HEIGHT + PROJ_OFFSET_Y * 2,
  };
}

// ── Table ─────────────────────────────────────────────────────────────────────
export function drawTable(ctx) {
  const ox = PROJ_OFFSET_X, oy = PROJ_OFFSET_Y;
  const tw = TABLE_WIDTH,   th = TABLE_HEIGHT;
  const rt = RAIL_THICKNESS;

  // Canvas background
  ctx.fillStyle = '#0a0f0a';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Rail (wood border)
  ctx.fillStyle = RAIL_COLOR;
  roundRect(ctx, ox, oy, tw, th, 10);
  ctx.fill();

  // Inner rail edge highlight
  ctx.strokeStyle = 'rgba(255,180,60,0.15)';
  ctx.lineWidth = 2;
  roundRect(ctx, ox, oy, tw, th, 10);
  ctx.stroke();

  // Felt (playing surface)
  ctx.fillStyle = FELT_COLOR;
  ctx.fillRect(ox + rt, oy + rt, tw - rt * 2, th - rt * 2);

  // Felt inner shadow
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 3;
  ctx.strokeRect(ox + rt, oy + rt, tw - rt * 2, th - rt * 2);

  // Pocket holes
  for (const p of POCKETS) {
    const { x, y } = project(p.x, p.y);
    // Dark hole
    ctx.beginPath();
    ctx.arc(x, y, POCKET_MOUTH_RADIUS + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#050905';
    ctx.fill();
    // Gold rim
    ctx.beginPath();
    ctx.arc(x, y, POCKET_MOUTH_RADIUS + 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#b8882a';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Inner pocket
    ctx.beginPath();
    ctx.arc(x, y, POCKET_MOUTH_RADIUS - 2, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();
  }

  // Break-zone center line
  const lx = ox + tw / 2;
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.setLineDash([8, 10]);
  ctx.beginPath();
  ctx.moveTo(lx, oy + rt + 4);
  ctx.lineTo(lx, oy + th - rt - 4);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Balls ─────────────────────────────────────────────────────────────────────
const DARK_BALLS = new Set([2, 4, 6, 7, 8, 10, 12, 14, 15]);
const R = BALL_RADIUS;

export function drawBall(ctx, index, lx, ly) {
  const isStripe = STRIPES.includes(index);
  const color    = BALL_COLORS[index];
  const { x, y } = project(lx, ly);

  // Drop shadow
  ctx.beginPath();
  ctx.arc(x + 2.5, y + 3, R * 0.88, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fill();

  // Base fill
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Stripe band (clipped horizontal white stripe with color center)
  if (isStripe) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - R, y - R * 0.44, R * 2, R * 0.88);
    ctx.beginPath();
    ctx.arc(x, y, R * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  // Number label
  if (index !== 0) {
    ctx.fillStyle   = DARK_BALLS.has(index) ? '#fff' : '#111';
    ctx.font        = `bold ${Math.round(R * 0.95)}px sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index), x, y + 1);
  }

  // Specular highlight (gives the ball a 3D look)
  const shine = ctx.createRadialGradient(
    x - R * 0.32, y - R * 0.38, R * 0.05,
    x, y, R
  );
  shine.addColorStop(0,   'rgba(255,255,255,0.62)');
  shine.addColorStop(0.45, 'rgba(255,255,255,0.1)');
  shine.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fillStyle = shine;
  ctx.fill();

  // Outline
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ── Cue ───────────────────────────────────────────────────────────────────────
export function drawCue(ctx, cueLx, cueLy, angle, power, dragging) {
  const { x: cx, y: cy } = project(cueLx, cueLy);
  const pullback  = (power / CUE_MAX_POWER) * 45;
  const tipDist   = R * 1.5;
  const totalLen  = CUE_LENGTH + pullback;

  // Tip and base screen positions
  const tx = cx - Math.cos(angle) * tipDist;
  const ty = cy - Math.sin(angle) * tipDist;
  const bx = tx - Math.cos(angle) * totalLen;
  const by = ty - Math.sin(angle) * totalLen;

  // Shadow
  ctx.beginPath();
  ctx.moveTo(tx + 2, ty + 3);
  ctx.lineTo(bx + 2, by + 3);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth   = CUE_TIP_WIDTH + 3;
  ctx.lineCap     = 'round';
  ctx.stroke();

  // Cue body (wood gradient tip→base)
  const grad = ctx.createLinearGradient(tx, ty, bx, by);
  grad.addColorStop(0,    '#f5e6c8');
  grad.addColorStop(0.12, '#d4b87c');
  grad.addColorStop(1,    '#3d1f00');
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(bx, by);
  ctx.strokeStyle = grad;
  ctx.lineWidth   = CUE_TIP_WIDTH;
  ctx.lineCap     = 'round';
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Aim guide line
  const ghostDist = R * 7;
  const gx = cx + Math.cos(angle) * ghostDist;
  const gy = cy + Math.sin(angle) * ghostDist;
  ctx.save();
  ctx.setLineDash([5, 7]);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(gx, gy);
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth   = 1;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Ghost ball
  ctx.beginPath();
  ctx.arc(gx, gy, R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.lineWidth   = 1;
  ctx.stroke();

  // Power arc
  if (dragging) {
    const t   = Math.min(power / CUE_MAX_POWER, 1);
    const hue = (1 - t) * 120;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 2.4, angle - 0.5, angle + 0.5);
    ctx.strokeStyle = `hsl(${hue},90%,52%)`;
    ctx.lineWidth   = 3;
    ctx.stroke();
  }
}

// ── Frame ─────────────────────────────────────────────────────────────────────
export function renderFrame(ctx, cueState) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  drawTable(ctx);

  const balls = getActiveBalls();
  for (const { index, x, y } of balls) {
    drawBall(ctx, index, x, y);
  }

  if (cueState?.visible) {
    drawCue(ctx, cueState.x, cueState.y, cueState.angle, cueState.power, cueState.dragging);
  }
}
