const sounds = {};
let muted = false;
let musicNode = null;

// Generate simple tones via Web Audio API as fallback (no external files needed)
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function beep(frequency, duration, type = 'sine', vol = 0.3) {
  if (muted) return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (e) { /* autoplay policy */ }
}

export function loadAudio() {
  // No external files — all sounds synthesized
}

export function playSound(name, volume = 1.0) {
  if (muted) return;
  switch (name) {
    case 'cue_hit':
      beep(180, 0.08, 'sawtooth', 0.4 * volume);
      break;
    case 'ball_collision':
      beep(520 + Math.random() * 80, 0.06, 'triangle', 0.3 * volume);
      break;
    case 'pocket':
      beep(220, 0.12, 'sine', 0.5 * volume);
      setTimeout(() => beep(160, 0.15, 'sine', 0.35 * volume), 90);
      break;
    case 'rail_hit':
      beep(300, 0.05, 'square', 0.15 * volume);
      break;
  }
}

let musicInterval = null;
let musicStep = 0;
const musicNotes = [130, 146, 164, 174, 195, 164, 146, 130];

export function startMusic() {
  if (musicInterval) return;
  musicStep = 0;
  musicInterval = setInterval(() => {
    if (!muted) {
      beep(musicNotes[musicStep % musicNotes.length], 0.35, 'sine', 0.06);
      musicStep++;
    }
  }, 500);
}

export function stopMusic() {
  if (musicInterval) { clearInterval(musicInterval); musicInterval = null; }
}

export function toggleMute() {
  muted = !muted;
  return muted;
}

export function isMuted() {
  return muted;
}
