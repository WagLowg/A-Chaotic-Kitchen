// Âm thanh tổng hợp bằng WebAudio – không cần file âm thanh.
let ctx = null;
let master = null;
let sizzleGain = null;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    return;
  }
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  // Tiếng xèo xèo của chảo – nhiễu trắng lọc cao, bật/tắt theo lửa.
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.02 ? 1 : 0.35);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  sizzleGain = ctx.createGain();
  sizzleGain.gain.value = 0;
  src.connect(hp).connect(sizzleGain).connect(master);
  src.start();
}

export function setSizzle(level) {
  if (!ctx) return;
  sizzleGain.gain.setTargetAtTime(Math.min(1, level) * 0.18, ctx.currentTime, 0.15);
}

function tone(freq, dur, type = 'sine', vol = 0.15, delay = 0, slide = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur, vol = 0.2, freq = 1200) {
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ctx.createBufferSource();
  s.buffer = b;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = vol;
  s.connect(f).connect(g).connect(master);
  s.start();
}

// Host gửi tên âm thanh cho máy khách qua hook này.
let sfxHook = null;
export function setSfxHook(fn) {
  sfxHook = fn;
}
/** Phát âm thanh nhận từ mạng (không gửi lại). */
export function playSfx(name) {
  RAW[name]?.();
}

const RAW = {
  pick: () => tone(520, 0.07, 'triangle', 0.12, 0, 120),
  place: () => tone(330, 0.08, 'triangle', 0.12, 0, -80),
  click: () => tone(900, 0.03, 'square', 0.05),
  chop: () => {
    noise(0.05, 0.35, 2500);
    tone(160, 0.05, 'square', 0.06);
  },
  toss: () => noise(0.18, 0.3, 900),
  pour: () => noise(0.4, 0.15, 600),
  wash: () => noise(0.12, 0.08, 1800),
  bell: () => {
    tone(1320, 0.7, 'sine', 0.18);
    tone(1980, 0.5, 'sine', 0.08, 0.02);
  },
  cash: () => {
    tone(1046, 0.09, 'square', 0.07);
    tone(1568, 0.25, 'square', 0.07, 0.08);
  },
  customer: () => {
    tone(660, 0.1, 'sine', 0.1);
    tone(880, 0.12, 'sine', 0.1, 0.1);
  },
  bad: () => tone(180, 0.35, 'sawtooth', 0.1, 0, -80),
  done: () => {
    tone(784, 0.08, 'sine', 0.12);
    tone(1175, 0.14, 'sine', 0.12, 0.08);
  },
};

export const sfx = {};
for (const k of Object.keys(RAW)) {
  sfx[k] = () => {
    RAW[k]();
    sfxHook?.(k);
  };
}
