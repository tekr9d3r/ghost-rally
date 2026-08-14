import type { Track } from './types';

/** Terrain node spacing used by the editor and daily tracks. */
export const NODE_DX = 120;
export const MIN_NODES = 16;
export const MAX_NODES = 60;
export const DEFAULT_NODES = 30;
/** How many nodes at each end are locked flat (start/finish aprons). */
export const FLAT_APRON = 3;
/** Editor y-offset limits (negative = uphill). */
export const MIN_Y = -420;
export const MAX_Y = 240;
export const MAX_BOOSTS = 8;
export const MAX_NAME_LEN = 24;
/** Terrain baseline in world coordinates. */
export const BASE_Y = 620;
/** Where the buggy spawns. */
export const START_X = 260;
/** Distance of the finish line from the last node. */
export const FINISH_PAD = 180;
/** Replay recording rate. */
export const GHOST_FPS = 30;
/** Longest replay we accept (5 minutes at GHOST_FPS, 3 numbers per frame). */
export const MAX_GHOST_NUMBERS = 5 * 60 * GHOST_FPS * 3;
/** Anti-cheat floor: even the shortest legal track can't be finished this fast. */
export const MIN_TIME_MS = 1000;

export const trackLength = (nodeCount: number, dx: number): number => (nodeCount - 1) * dx;
export const finishX = (nodeCount: number, dx: number): number =>
  trackLength(nodeCount, dx) - FINISH_PAD;

/** Deterministic 32-bit hash of a string. */
export const hashString = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** Small fast deterministic PRNG. */
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** UTC day key, e.g. "2026-07-06". */
export const dayKey = (d = new Date()): string => d.toISOString().slice(0, 10);

/** ISO week key, e.g. "2026-W28". */
export const weekKey = (d = new Date()): string => {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

/** Sequential rally number so the daily post reads "Daily Rally #N". */
export const dailyRallyNumber = (day: string): number => {
  const epoch = Date.UTC(2026, 5, 17); // hackathon start, rally #1
  const t = Date.parse(`${day}T00:00:00Z`);
  return Math.max(1, Math.floor((t - epoch) / 86400000) + 1);
};

/**
 * Catmull-Rom smoothing of terrain nodes into a dense polyline.
 * MUST stay deterministic and identical on client + any consumer:
 * ghosts replay against this exact ground.
 */
export const buildTerrainPolyline = (
  nodes: number[],
  dx: number,
  stepsPerSegment = 8
): { x: number; y: number }[] => {
  const pts: { x: number; y: number }[] = [];
  const get = (i: number): { x: number; y: number } => {
    const j = Math.max(0, Math.min(nodes.length - 1, i));
    return { x: j * dx, y: BASE_Y + (nodes[j] ?? 0) };
  };
  for (let i = 0; i < nodes.length - 1; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    for (let s = 0; s < stepsPerSegment; s++) {
      const t = s / stepsPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      pts.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  pts.push(get(nodes.length - 1));
  return pts;
};

/** Terrain height at a given x (linear interp over the polyline). */
export const terrainYAt = (poly: { x: number; y: number }[], x: number): number => {
  if (poly.length === 0) return BASE_Y;
  const first = poly[0]!;
  const last = poly[poly.length - 1]!;
  if (x <= first.x) return first.y;
  if (x >= last.x) return last.y;
  // Polyline x is monotonically increasing — binary search.
  let lo = 0;
  let hi = poly.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (poly[mid]!.x <= x) lo = mid;
    else hi = mid;
  }
  const a = poly[lo]!;
  const b = poly[hi]!;
  const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
  return a.y + (b.y - a.y) * t;
};

/** Tunable knobs for the seeded terrain generator (used by daily rally + campaign stages). */
export type DifficultyParams = {
  minNodes: number;
  /** Exclusive upper bound: node count = minNodes + floor(rng() * (maxNodes - minNodes)). */
  maxNodes: number;
  /** Multiplies terrain amplitude/noise. 1 = daily-rally intensity, lower = gentler. */
  ampScale: number;
  boostMin: number;
  /** Exclusive upper bound, same pattern as maxNodes. */
  boostMax: number;
  /** Whether to carve one deep valley partway through the track. */
  bigDip: boolean;
};

/** Reproduces the original (pre-campaign) daily-rally tuning exactly. */
const DAILY_PARAMS: DifficultyParams = {
  minNodes: 36,
  maxNodes: 46,
  ampScale: 1,
  boostMin: 2,
  boostMax: 5,
  bigDip: true,
};

/**
 * Core deterministic terrain generator. Shared by the daily rally and campaign
 * stages — same seed + params always produces the same track, forever.
 */
export const generateSeededTrack = (
  seed: string,
  params: DifficultyParams,
  meta: { name: string; owner: string; day: string }
): Track => {
  const rng = mulberry32(hashString(seed));
  const count = params.minNodes + Math.floor(rng() * (params.maxNodes - params.minNodes));
  const nodes: number[] = [];
  // Layered sine waves whose amplitude grows toward the finish.
  const f1 = 0.35 + rng() * 0.25;
  const f2 = 0.9 + rng() * 0.5;
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const bigDip = params.bigDip ? 6 + Math.floor(rng() * Math.max(1, count - 12)) : -1;
  for (let i = 0; i < count; i++) {
    const ramp = Math.min(1, i / 8); // ease difficulty in
    let y =
      Math.sin(i * f1 + p1) * 110 * ramp * params.ampScale +
      Math.sin(i * f2 + p2) * 55 * ramp * params.ampScale +
      (rng() - 0.5) * 40 * ramp * params.ampScale;
    if (bigDip >= 0 && Math.abs(i - bigDip) <= 1) y += 130; // one big valley
    nodes.push(Math.max(MIN_Y, Math.min(MAX_Y, Math.round(y))));
  }
  for (let i = 0; i < FLAT_APRON; i++) {
    nodes[i] = 0;
    nodes[count - 1 - i] = nodes[count - 1 - FLAT_APRON] ?? 0;
  }
  const boosts: number[] = [];
  const nBoosts = params.boostMin + Math.floor(rng() * (params.boostMax - params.boostMin));
  for (let i = 0; i < nBoosts; i++) {
    boosts.push(Math.round((5 + rng() * (count - 10)) * NODE_DX));
  }
  return { v: 1, name: meta.name, owner: meta.owner, nodes, dx: NODE_DX, boosts, day: meta.day };
};

/** Generate the seeded Daily Rally track for a given UTC day. */
export const generateDailyTrack = (day: string): Track =>
  generateSeededTrack(`ghost-rally:${day}`, DAILY_PARAMS, {
    name: `Daily Rally #${dailyRallyNumber(day)}`,
    owner: 'ghost-rally',
    day,
  });

export type TrackValidationError = string;

/** Validate an editor-submitted track. Returns null when OK. */
export const validateTrackSubmission = (body: {
  name: unknown;
  nodes: unknown;
  dx: unknown;
  boosts: unknown;
}): TrackValidationError | null => {
  const { name, nodes, dx, boosts } = body;
  if (typeof name !== 'string' || name.trim().length < 3 || name.trim().length > MAX_NAME_LEN) {
    return `Track name must be 3–${MAX_NAME_LEN} characters.`;
  }
  if (dx !== NODE_DX) return 'Invalid node spacing.';
  if (!Array.isArray(nodes) || nodes.length < MIN_NODES || nodes.length > MAX_NODES) {
    return `Track must have between ${MIN_NODES} and ${MAX_NODES} nodes.`;
  }
  if (!nodes.every((y) => typeof y === 'number' && Number.isFinite(y) && y >= MIN_Y && y <= MAX_Y)) {
    return 'Terrain out of bounds.';
  }
  if (!Array.isArray(boosts) || boosts.length > MAX_BOOSTS) {
    return `At most ${MAX_BOOSTS} boost pads.`;
  }
  const maxX = trackLength(nodes.length, NODE_DX);
  if (!boosts.every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0 && x < maxX)) {
    return 'Boost pad out of bounds.';
  }
  return null;
};

export const validateGhostSubmission = (ghost: {
  timeMs: unknown;
  fps: unknown;
  frames: unknown;
}): TrackValidationError | null => {
  if (typeof ghost.timeMs !== 'number' || ghost.timeMs < MIN_TIME_MS) return 'Run too short.';
  if (ghost.fps !== GHOST_FPS) return 'Invalid replay rate.';
  if (
    !Array.isArray(ghost.frames) ||
    ghost.frames.length % 3 !== 0 ||
    ghost.frames.length < 30 ||
    ghost.frames.length > MAX_GHOST_NUMBERS ||
    !ghost.frames.every((n) => typeof n === 'number' && Number.isFinite(n))
  ) {
    return 'Invalid replay.';
  }
  return null;
};

export const formatMs = (ms: number): string => {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return m > 0
    ? `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
    : `${s}.${String(cs).padStart(2, '0')}s`;
};
