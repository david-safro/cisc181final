const sounds = {};
let muted = false;

// Web Audio API context
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

// Background music
let musicAudio = null;
let musicStartPending = false;

function resumeOnInteraction() {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  if (musicStartPending && musicAudio && !muted) {
    musicAudio.play().catch(() => {});
    musicStartPending = false;
  }
}
document.addEventListener('click',      resumeOnInteraction, { passive: true });
document.addEventListener('touchstart', resumeOnInteraction, { passive: true });
document.addEventListener('keydown',    resumeOnInteraction, { passive: true });

// Generate simple tones for sound effects
function beep(frequency, duration, type = 'sine', vol = 0.3) {
  if (muted) return;

  try {
    const ctx = getAudioCtx();

    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = type;
    osc.frequency.value = frequency;

    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + duration
    );

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    console.error('Audio error:', e);
  }
}

export function loadAudio() {
  musicAudio = new Audio('../resources/music.mp3');
  musicAudio.loop = true;
  musicAudio.volume = 0.3;
  musicAudio.preload = 'auto';
}

export function playSound(name, volume = 1.0) {
  if (muted) return;

  switch (name) {
    case 'cue_hit':
      beep(180, 0.08, 'sawtooth', 0.4 * volume);
      break;

    case 'ball_collision':
      beep(
        520 + Math.random() * 80,
        0.06,
        'triangle',
        0.3 * volume
      );
      break;

    case 'pocket':
      beep(220, 0.12, 'sine', 0.5 * volume);

      setTimeout(() => {
        beep(160, 0.15, 'sine', 0.35 * volume);
      }, 90);

      break;

    case 'rail_hit':
      beep(300, 0.05, 'square', 0.15 * volume);
      break;
  }
}

export function startMusic() {
  if (!musicAudio) loadAudio();
  if (muted) return;
  musicAudio.play().catch(() => {
    musicStartPending = true;
  });
}

export function stopMusic() {
  if (musicAudio) {
    musicAudio.pause();
    musicAudio.currentTime = 0;
  }
}

export function toggleMute() {
  muted = !muted;

  if (musicAudio) {
    if (muted) {
      musicAudio.pause();
    } else {
      musicAudio.play().catch(() => {});
    }
  }

  return muted;
}

export function isMuted() {
  return muted;
}
