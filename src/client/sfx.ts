/**
 * Tiny procedural sound engine — zero audio assets.
 * Everything is synthesized with WebAudio oscillators + filtered noise.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;

// Engine loop state
let engineOsc: OscillatorNode | null = null;
let engineOsc2: OscillatorNode | null = null;
let engineGain: GainNode | null = null;
let engineFilter: BiquadFilterNode | null = null;

const ensureCtx = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    const len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
};

/** Call from the first user gesture to unlock audio. */
export const unlockAudio = (): void => {
  ensureCtx();
};

export const setMuted = (m: boolean): void => {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
};

export const isMuted = (): boolean => muted;

const tone = (
  freq: number,
  durMs: number,
  type: OscillatorType = 'sine',
  vol = 0.3,
  slideTo?: number
): void => {
  const c = ensureCtx();
  if (!c || !master) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  if (slideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), c.currentTime + durMs / 1000);
  }
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + durMs / 1000);
  osc.connect(g).connect(master);
  osc.start();
  osc.stop(c.currentTime + durMs / 1000 + 0.02);
};

const noise = (durMs: number, filterFreq: number, vol = 0.3, q = 1): void => {
  const c = ensureCtx();
  if (!c || !master || !noiseBuf) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.7 + Math.random() * 0.6;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filterFreq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + durMs / 1000);
  src.connect(f).connect(g).connect(master);
  src.start();
  src.stop(c.currentTime + durMs / 1000 + 0.02);
};

export const sfx = {
  click: (): void => tone(600, 70, 'square', 0.12, 400),
  hover: (): void => tone(880, 40, 'sine', 0.05),
  countBeep: (): void => tone(440, 120, 'square', 0.2),
  goBeep: (): void => tone(880, 350, 'square', 0.25),
  thud: (strength = 1): void => noise(120, 300 + 400 * strength, Math.min(0.5, 0.18 * strength)),
  skid: (): void => noise(80, 1200, 0.05),
  boost: (): void => {
    tone(200, 400, 'sawtooth', 0.25, 900);
    noise(300, 2500, 0.15);
  },
  crash: (): void => {
    noise(500, 500, 0.5);
    tone(120, 400, 'sawtooth', 0.3, 40);
  },
  finish: (): void => {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 220, 'triangle', 0.3), i * 110));
  },
  record: (): void => {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) =>
      setTimeout(() => tone(f, 260, 'triangle', 0.3), i * 90)
    );
  },
  pb: (): void => {
    [659, 880].forEach((f, i) => setTimeout(() => tone(f, 180, 'triangle', 0.25), i * 100));
  },
  pop: (): void => tone(300, 90, 'sine', 0.2, 600),
  error: (): void => tone(220, 220, 'square', 0.15, 110),
};

/** Start the engine loop (idempotent). */
export const engineStart = (): void => {
  const c = ensureCtx();
  if (!c || !master || engineOsc) return;
  engineOsc = c.createOscillator();
  engineOsc2 = c.createOscillator();
  engineGain = c.createGain();
  engineFilter = c.createBiquadFilter();
  engineOsc.type = 'sawtooth';
  engineOsc2.type = 'square';
  engineOsc.frequency.value = 55;
  engineOsc2.frequency.value = 28;
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = 500;
  engineGain.gain.value = 0;
  engineOsc.connect(engineFilter);
  engineOsc2.connect(engineFilter);
  engineFilter.connect(engineGain).connect(master);
  engineOsc.start();
  engineOsc2.start();
};

/** rpm 0..1, load 0..1 */
export const engineUpdate = (rpm: number, load: number): void => {
  if (!engineOsc || !engineOsc2 || !engineGain || !engineFilter || !ctx) return;
  const f = 45 + rpm * 180;
  engineOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
  engineOsc2.frequency.setTargetAtTime(f / 2, ctx.currentTime, 0.05);
  engineFilter.frequency.setTargetAtTime(300 + rpm * 900, ctx.currentTime, 0.05);
  engineGain.gain.setTargetAtTime(0.03 + load * 0.09, ctx.currentTime, 0.08);
};

export const engineStop = (): void => {
  // Detach immediately so a following engineStart() creates a fresh engine —
  // the old oscillators fade out and stop on their own.
  const osc = engineOsc;
  const osc2 = engineOsc2;
  const gain = engineGain;
  engineOsc = null;
  engineOsc2 = null;
  engineGain = null;
  engineFilter = null;
  if (!ctx) return;
  const t = ctx.currentTime;
  gain?.gain.setTargetAtTime(0, t, 0.08);
  try {
    osc?.stop(t + 0.35);
    osc2?.stop(t + 0.35);
  } catch {
    /* already stopped */
  }
};
