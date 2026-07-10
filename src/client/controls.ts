/**
 * Shared control layout: the Hud draws the buttons, the Race scene hit-tests
 * pointers against the same rectangles. Four controls, motorcycle-style:
 *
 *   [BRAKE]  [LEAN BACK ▼]     [LEAN FWD ▲]  [GAS]
 *    left outer  left inner      right inner   right outer
 */

export type ControlRect = {
  cx: number;
  cy: number;
  w: number;
  h: number;
};

export type ControlLayout = {
  brake: ControlRect;
  leanFwd: ControlRect;
  leanBack: ControlRect;
  gas: ControlRect;
  scale: number;
};

/** iOS home-indicator / gesture-bar inset, exposed via CSS in game.css. */
const safeBottom = (): number => {
  if (typeof document === 'undefined') return 0;
  const v = getComputedStyle(document.documentElement).getPropertyValue('--sab');
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export const controlLayout = (w: number, h: number): ControlLayout => {
  const s = Math.min(Math.max(Math.min(w / 640, h / 640), 0.8), 1.25);
  const size = 104 * s;
  const gap = 14 * s;
  // leave room for the caption text below the buttons + any OS gesture bar
  const cy = h - size / 2 - 34 * s - safeBottom();
  const outer = size / 2 + 16 * s;
  return {
    brake: { cx: outer, cy, w: size, h: size },
    leanBack: { cx: outer + size + gap, cy, w: size, h: size },
    leanFwd: { cx: w - outer - size - gap, cy, w: size, h: size },
    gas: { cx: w - outer, cy, w: size, h: size },
    scale: s,
  };
};

/** Generous hit test (buttons get 30% padding for fat thumbs). */
export const inRect = (r: ControlRect, x: number, y: number, pad = 1.3): boolean =>
  Math.abs(x - r.cx) <= (r.w * pad) / 2 && Math.abs(y - r.cy) <= (r.h * pad) / 2;
