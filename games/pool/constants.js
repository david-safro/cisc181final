// Table geometry
export const TABLE_WIDTH = 900;
export const TABLE_HEIGHT = 450;
export const RAIL_THICKNESS = 36;
export const FELT_COLOR = '#1a6b3c';
export const RAIL_COLOR = '#5c3a1e';

// Ball properties
export const BALL_RADIUS = 12;
export const BALL_MASS = 1.0;
export const RESTITUTION = 0.975;
export const ROLLING_FRICTION = 0.9980; // ~8s hard shot, ~6s medium shot at 120Hz
export const SPIN_DECAY = 0.95;
export const SPIN_GRIP = 0.025;
export const SLEEP_SPEED_SQ = 0.05;

// Physics engine settings
export const FIXED_DT = 1 / 120;
export const MAX_STEPS_PER_FRAME = 8;
export const CCD_ENABLED = true;
export const SPATIAL_CELL_SIZE = BALL_RADIUS * 2 + 2;
export const BAUMGARTE = 0.4;
export const PENETRATION_SLOP = 0.3;

// Pocket positions
export const POCKET_MOUTH_RADIUS = 20;
export const POCKETS = [
  { x: RAIL_THICKNESS, y: RAIL_THICKNESS },
  { x: TABLE_WIDTH / 2, y: RAIL_THICKNESS - 4 },
  { x: TABLE_WIDTH - RAIL_THICKNESS, y: RAIL_THICKNESS },
  { x: RAIL_THICKNESS, y: TABLE_HEIGHT - RAIL_THICKNESS },
  { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT - RAIL_THICKNESS + 4 },
  { x: TABLE_WIDTH - RAIL_THICKNESS, y: TABLE_HEIGHT - RAIL_THICKNESS },
];

// Projection settings (top-down: 1px = 1 unit, just centered on canvas)
export const PROJ_OFFSET_X = 100;   // (canvas 1100 - table 900) / 2
export const PROJ_OFFSET_Y = 95;    // (canvas 640 - table 450) / 2

// Cue settings
export const CUE_LENGTH = 220;
export const CUE_BASE_WIDTH = 9;
export const CUE_TIP_WIDTH = 3;
export const CUE_COLOR_TIP = '#f5e6c8';
export const CUE_COLOR_BASE = '#3d1f00';
export const CUE_MIN_POWER = 0.4;
export const CUE_MAX_POWER = 16;    // max velocity/tick kept below ball diameter (24) to prevent tunneling
export const CUE_POWER_RATE = 0.14;
export const CUE_SPIN_FACTOR = 0.18;

// Ball groups
export const SOLIDS = [1, 2, 3, 4, 5, 6, 7];
export const STRIPES = [9, 10, 11, 12, 13, 14, 15];
export const CUE_BALL = 0;
export const EIGHT_BALL = 8;

// Rack position (center of triangle) and break position
export const RACK_X = TABLE_WIDTH * 0.65;
export const RACK_Y = TABLE_HEIGHT / 2;
export const BREAK_X = TABLE_WIDTH * 0.25;
export const BREAK_Y = TABLE_HEIGHT / 2;

// Network
export const WS_URL = `ws://${location.host}/ws`;
export const RECONNECT_DELAY_MS = 2000;
export const STATE_SYNC_INTERVAL_MS = 500;
export const PING_INTERVAL_MS = 10000;

// Ball colors (index 0–15)
export const BALL_COLORS = [
  '#ffffff', // 0: cue ball
  '#f5c518', // 1: yellow solid
  '#1a47b8', // 2: blue solid
  '#cc2200', // 3: red solid
  '#7b2d8b', // 4: purple solid
  '#e05c00', // 5: orange solid
  '#1a8a1a', // 6: green solid
  '#8b1a1a', // 7: maroon solid
  '#111111', // 8: eight ball
  '#f5c518', // 9: yellow stripe
  '#1a47b8', // 10: blue stripe
  '#cc2200', // 11: red stripe
  '#7b2d8b', // 12: purple stripe
  '#e05c00', // 13: orange stripe
  '#1a8a1a', // 14: green stripe
  '#8b1a1a', // 15: maroon stripe
];
