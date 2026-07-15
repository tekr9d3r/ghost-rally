import { context, requestExpandedMode } from '@devvit/web/client';
import type { TrackPostData } from '../shared/types';
import { NODE_DX, buildTerrainPolyline, formatMs, terrainYAt } from '../shared/track';

const $ = (id: string): HTMLElement => document.getElementById(id)!;

const playButton = $('play-button') as HTMLButtonElement;
playButton.addEventListener('click', (e) => {
  requestExpandedMode(e, 'game');
});

/** Render the track's elevation profile as an inline SVG ribbon. */
const renderTrackPreview = (nodes: number[], boosts: number[]): void => {
  const host = $('track-preview');
  const poly = buildTerrainPolyline(nodes, NODE_DX, 4);
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const W = 300;
  const H = 56;
  const padTop = 12;
  const padBottom = 10;
  const sx = (x: number): number => ((x - minX) / (maxX - minX || 1)) * W;
  const sy = (y: number): number =>
    padTop + ((y - minY) / (maxY - minY || 1)) * (H - padTop - padBottom);

  const line = poly.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const fill = `${line} L${W},${H} L0,${H} Z`;

  const boostDots = boosts
    .map((bx) => {
      const by = terrainYAt(poly, bx);
      return `<circle cx="${sx(bx).toFixed(1)}" cy="${(sy(by) - 3).toFixed(1)}" r="3.2" fill="#ffa62b" stroke="#1a1200" stroke-width="0.8"/>`;
    })
    .join('');

  const startY = sy(terrainYAt(poly, minX + 1));
  const endY = sy(terrainYAt(poly, maxX - 1));

  host.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <path d="${fill}" fill="rgba(84,57,42,0.72)"/>
      <path d="${line}" fill="none" stroke="#6fc24b" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
      ${boostDots}
      <circle cx="2.5" cy="${(startY - 2).toFixed(1)}" r="3" fill="#ffffff"/>
      <text x="${W - 13}" y="${(endY - 7).toFixed(1)}" font-size="13">🏁</text>
    </svg>`;
  host.classList.add('visible');
};

/** Tick a HH:MM:SS countdown to the next UTC midnight. */
const startCountdown = (): void => {
  const el = $('countdown-time');
  const tick = (): void => {
    const now = new Date();
    const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    let secs = Math.max(0, Math.floor((midnight - now.getTime()) / 1000));
    const h = Math.floor(secs / 3600);
    secs %= 3600;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    el.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  tick();
  setInterval(tick, 1000);
};

// postData is TrackPostData | HubPostData | DailyPostData — discriminate on `kind`
const pd = context.postData as unknown as
  | (Partial<Omit<TrackPostData, 'kind'>> & { kind?: 'track' | 'hub' | 'daily' })
  | undefined;

if (pd?.kind === 'daily') {
  // Pinned daily post: today's rally with a live reset countdown.
  $('kicker').textContent = 'GHOST RALLY · DAILY TRACK';
  $('headline').textContent = "Catch today's ghost";
  $('countdown').classList.add('visible');
  startCountdown();
  $('cta-label').textContent = '🏁  RACE THE GHOST';
  $('sub').textContent = "today's ghost is a real redditor · beat their time";
} else if (pd?.kind === 'track' && pd.name) {
  // Community track post: name, track shape, time to beat. Nothing else.
  $('kicker').style.display = 'none';
  $('headline').textContent = pd.name;
  if (Array.isArray(pd.nodes) && pd.nodes.length > 1) {
    renderTrackPreview(pd.nodes, Array.isArray(pd.boosts) ? pd.boosts : []);
  }
  const bits: string[] = [];
  if (pd.recordUser && pd.recordMs) {
    $('cta-label').textContent = `🏁  BEAT ${formatMs(pd.recordMs)}`;
    bits.push(`👑 u/${pd.recordUser}`);
  } else {
    $('cta-label').textContent = '🏁  RACE THIS TRACK';
    bits.push('no record yet — set the first ghost');
  }
  if (pd.attempts && pd.attempts > 1) bits.push(`${pd.attempts} runs`);
  if (pd.racers && pd.racers > 1) bits.push(`${pd.racers} racers`);
  $('sub').textContent = bits.join(' · ');
} else {
  // Hub post: today's rally.
  $('kicker').textContent = 'GHOST RALLY';
  $('headline').textContent = 'Can you catch the ghost?';
  $('cta-label').textContent = '🏁  RACE THE GHOST';
  $('sub').textContent = 'new track daily · the ghosts are real redditors';
}
