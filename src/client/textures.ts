import * as Phaser from 'phaser';

/**
 * All game art is generated procedurally at boot — zero image assets.
 * Chunky, high-contrast cartoon style tuned for small mobile screens.
 */

export const PALETTE = {
  skyTop: 0x1b2a5e,
  skyMid: 0x53417e,
  skyHorizon: 0xd97e54,
  sun: 0xffd98a,
  hillFar: 0x3a3568,
  hillNear: 0x2c2a52,
  dirt: 0x6b4a35,
  dirtDark: 0x54392a,
  grass: 0x6fc24b,
  grassDark: 0x4e9636,
  body: 0xe8543f,
  bodyDark: 0xb93c2b,
  cage: 0x2e3440,
  rim: 0xc9cdd6,
  tire: 0x22252b,
  helmet: 0xf4f1e8,
  visor: 0x3ec6c9,
  boost: 0xffa62b,
  boostHot: 0xffe08a,
  ghostRecord: 0xffd166,
  ghostMine: 0x66e0ff,
  uiPanel: 0x141c30,
  uiPanelLight: 0x233150,
  uiAccent: 0xffa62b,
  uiGood: 0x6fc24b,
  uiBad: 0xe8543f,
  textMain: '#ffffff',
  textDim: '#aab4d4',
  textAccent: '#ffa62b',
  textGood: '#8ee06a',
  textBad: '#ff7b66',
} as const;

const g = (scene: Phaser.Scene): Phaser.GameObjects.Graphics => scene.make.graphics({ x: 0, y: 0 });

const makeSky = (scene: Phaser.Scene): void => {
  const w = 32;
  const h = 512;
  const tex = scene.textures.createCanvas('sky', w, h);
  if (!tex) return;
  const c = tex.getContext();
  const grad = c.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1b2a5e');
  grad.addColorStop(0.55, '#53417e');
  grad.addColorStop(0.85, '#c96f4a');
  grad.addColorStop(1, '#d97e54');
  c.fillStyle = grad;
  c.fillRect(0, 0, w, h);
  tex.refresh();
};

const makeSoftCircle = (scene: Phaser.Scene, key: string, size: number, rgb: string): void => {
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return;
  const c = tex.getContext();
  const r = size / 2;
  const grad = c.createRadialGradient(r, r, 1, r, r, r);
  grad.addColorStop(0, `rgba(${rgb},0.9)`);
  grad.addColorStop(0.6, `rgba(${rgb},0.35)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = grad;
  c.fillRect(0, 0, size, size);
  tex.refresh();
};

const makeHill = (scene: Phaser.Scene, key: string, w: number, h: number, color: number, rough: number): void => {
  const gr = g(scene);
  gr.fillStyle(color, 1);
  gr.beginPath();
  gr.moveTo(0, h);
  const seed = key.length * 13.7;
  for (let x = 0; x <= w; x += 8) {
    const y =
      h * 0.55 +
      Math.sin(x * 0.004 + seed) * h * 0.3 +
      Math.sin(x * 0.011 + seed * 2) * h * 0.12 * rough;
    gr.lineTo(x, Math.max(4, y));
  }
  gr.lineTo(w, h);
  gr.closePath();
  gr.fillPath();
  gr.generateTexture(key, w, h);
  gr.destroy();
};

const makeWheel = (scene: Phaser.Scene): void => {
  const s = 48;
  const r = s / 2;
  const gr = g(scene);
  gr.fillStyle(PALETTE.tire, 1);
  gr.fillCircle(r, r, r);
  gr.fillStyle(0x30343c, 1);
  gr.fillCircle(r, r, r - 3);
  gr.fillStyle(PALETTE.rim, 1);
  gr.fillCircle(r, r, r - 9);
  gr.fillStyle(0x9aa0ad, 1);
  // spokes make the spin readable
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    gr.save();
    gr.translateCanvas(r, r);
    gr.rotateCanvas(a);
    gr.fillRect(-2.5, -(r - 10), 5, (r - 10) * 2);
    gr.restore();
  }
  gr.fillStyle(0x30343c, 1);
  gr.fillCircle(r, r, 5);
  gr.generateTexture('wheel', s, s);
  gr.destroy();
};

const drawBuggyBody = (gr: Phaser.GameObjects.Graphics, ox: number, oy: number): void => {
  // 116x56 sprite; nose faces +x. Rear (x=0) to front (x=116).
  // spoiler
  gr.fillStyle(PALETTE.cage, 1);
  gr.fillRect(ox + 2, oy + 4, 18, 5);
  gr.fillRect(ox + 6, oy + 8, 5, 12);
  // roll cage
  gr.lineStyle(6, PALETTE.cage, 1);
  gr.beginPath();
  gr.arc(ox + 58, oy + 26, 22, Math.PI, Math.PI * 1.85, false);
  gr.strokePath();
  // helmet
  gr.fillStyle(PALETTE.helmet, 1);
  gr.fillCircle(ox + 56, oy + 14, 11);
  gr.fillStyle(PALETTE.visor, 1);
  gr.fillRect(ox + 58, oy + 9, 10, 8);
  // main body wedge
  gr.fillStyle(PALETTE.body, 1);
  gr.beginPath();
  gr.moveTo(ox + 2, oy + 18);
  gr.lineTo(ox + 40, oy + 22);
  gr.lineTo(ox + 84, oy + 20);
  gr.lineTo(ox + 114, oy + 32);
  gr.lineTo(ox + 112, oy + 44);
  gr.lineTo(ox + 6, oy + 44);
  gr.closePath();
  gr.fillPath();
  // skirt
  gr.fillStyle(PALETTE.bodyDark, 1);
  gr.fillRect(ox + 6, oy + 38, 106, 7);
  // stripe
  gr.fillStyle(0xffffff, 0.85);
  gr.fillRect(ox + 22, oy + 24, 30, 6);
  // headlight
  gr.fillStyle(0xffe08a, 1);
  gr.fillCircle(ox + 110, oy + 30, 4);
};

const makeBuggy = (scene: Phaser.Scene): void => {
  const gr = g(scene);
  drawBuggyBody(gr, 0, 0);
  gr.generateTexture('chassis', 116, 56);
  gr.destroy();

  // Ghost: full silhouette (body + wheels) in white, tinted at runtime.
  const gr2 = g(scene);
  drawBuggyBody(gr2, 6, 0);
  gr2.fillStyle(0xffffff, 1);
  gr2.fillCircle(30, 52, 17);
  gr2.fillCircle(102, 52, 17);
  gr2.fillStyle(0x888888, 1);
  gr2.fillCircle(30, 52, 8);
  gr2.fillCircle(102, 52, 8);
  gr2.generateTexture('ghostBuggyRaw', 128, 72);
  gr2.destroy();
};

const makeBoost = (scene: Phaser.Scene): void => {
  const w = 76;
  const h = 22;
  const gr = g(scene);
  gr.fillStyle(PALETTE.boost, 1);
  gr.fillRoundedRect(0, 0, w, h, 6);
  gr.fillStyle(PALETTE.boostHot, 1);
  // chevrons
  for (const ox of [14, 38]) {
    gr.beginPath();
    gr.moveTo(ox, 4);
    gr.lineTo(ox + 14, h / 2);
    gr.lineTo(ox, h - 4);
    gr.lineTo(ox + 7, h / 2);
    gr.closePath();
    gr.fillPath();
  }
  gr.generateTexture('boost', w, h);
  gr.destroy();
};

const makeFlag = (scene: Phaser.Scene): void => {
  const gr = g(scene);
  // pole
  gr.fillStyle(0xd8dbe2, 1);
  gr.fillRect(0, 0, 6, 130);
  // checkered flag
  const cell = 11;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      gr.fillStyle((r + c) % 2 === 0 ? 0xffffff : 0x1a1d24, 1);
      gr.fillRect(6 + c * cell, r * cell, cell, cell);
    }
  }
  gr.generateTexture('flag', 6 + 5 * 11, 130);
  gr.destroy();
};

const makeCloud = (scene: Phaser.Scene): void => {
  const gr = g(scene);
  gr.fillStyle(0xffffff, 0.9);
  gr.fillEllipse(50, 30, 90, 34);
  gr.fillEllipse(90, 24, 70, 30);
  gr.fillEllipse(120, 32, 80, 26);
  gr.generateTexture('cloud', 170, 50);
  gr.destroy();
};

const makeParticles = (scene: Phaser.Scene): void => {
  makeSoftCircle(scene, 'dust', 32, '210,190,160');
  makeSoftCircle(scene, 'glow', 64, '255,214,102');
  const gr = g(scene);
  gr.fillStyle(0xffffff, 1);
  gr.fillCircle(4, 4, 4);
  gr.generateTexture('dot', 8, 8);
  gr.destroy();
  const gr2 = g(scene);
  gr2.fillStyle(0xffffff, 1);
  gr2.fillRect(0, 0, 8, 13);
  gr2.generateTexture('confetti', 8, 13);
  gr2.destroy();
};

const makeHandle = (scene: Phaser.Scene): void => {
  const gr = g(scene);
  gr.fillStyle(0x000000, 0.35);
  gr.fillCircle(16, 16, 15);
  gr.fillStyle(0xffffff, 1);
  gr.fillCircle(16, 16, 12);
  gr.fillStyle(PALETTE.uiAccent, 1);
  gr.fillCircle(16, 16, 7);
  gr.generateTexture('handle', 32, 32);
  gr.destroy();

  const gr2 = g(scene);
  gr2.lineStyle(3, 0xffffff, 0.9);
  gr2.strokeCircle(14, 14, 12);
  gr2.lineBetween(8, 14, 20, 14);
  gr2.lineBetween(14, 8, 14, 20);
  gr2.generateTexture('handleAdd', 28, 28);
  gr2.destroy();
};

const pedalBase = (gr: Phaser.GameObjects.Graphics): void => {
  gr.fillStyle(0xffffff, 0.13);
  gr.fillRoundedRect(0, 0, 120, 120, 28);
  gr.lineStyle(3, 0xffffff, 0.25);
  gr.strokeRoundedRect(1, 1, 118, 118, 28);
};

const makePedals = (scene: Phaser.Scene): void => {
  // gas (▶)
  const gr = g(scene);
  pedalBase(gr);
  gr.fillStyle(0xffffff, 0.85);
  gr.beginPath();
  gr.moveTo(42, 34);
  gr.lineTo(90, 60);
  gr.lineTo(42, 86);
  gr.closePath();
  gr.fillPath();
  gr.generateTexture('pedalGas', 120, 120);
  gr.destroy();

  // brake (◀)
  const gr2 = g(scene);
  pedalBase(gr2);
  gr2.fillStyle(0xffffff, 0.85);
  gr2.beginPath();
  gr2.moveTo(78, 34);
  gr2.lineTo(30, 60);
  gr2.lineTo(78, 86);
  gr2.closePath();
  gr2.fillPath();
  gr2.generateTexture('pedalBrake', 120, 120);
  gr2.destroy();

  // lean buttons: plain up/down arrows, matching the gas/brake triangles
  const drawLeanPedal = (key: string, up: boolean): void => {
    const gr4 = g(scene);
    pedalBase(gr4);
    gr4.fillStyle(0xffffff, 0.85);
    gr4.beginPath();
    if (up) {
      gr4.moveTo(60, 34);
      gr4.lineTo(86, 82);
      gr4.lineTo(34, 82);
    } else {
      gr4.moveTo(60, 86);
      gr4.lineTo(86, 38);
      gr4.lineTo(34, 38);
    }
    gr4.closePath();
    gr4.fillPath();
    gr4.generateTexture(key, 120, 120);
    gr4.destroy();
  };
  drawLeanPedal('pedalLeanFwd', true); // ▲ lean forward (nose down)
  drawLeanPedal('pedalLeanBack', false); // ▼ lean back (nose up / backflip)
};

const makeMedal = (scene: Phaser.Scene, key: string, color: number, ringColor: number): void => {
  const r = 26;
  const gr = g(scene);
  gr.fillStyle(0x000000, 0.25);
  gr.fillCircle(r, r + 2, r);
  gr.fillStyle(color, 1);
  gr.fillCircle(r, r, r);
  gr.lineStyle(3, ringColor, 1);
  gr.strokeCircle(r, r, r - 2);
  // simple 5-point star
  gr.fillStyle(0xffffff, 0.9);
  gr.beginPath();
  const spikes = 5;
  const outerR = r * 0.5;
  const innerR = r * 0.22;
  for (let i = 0; i < spikes * 2; i++) {
    const rad = i % 2 === 0 ? outerR : innerR;
    const ang = (Math.PI / spikes) * i - Math.PI / 2;
    const px = r + Math.cos(ang) * rad;
    const py = r + Math.sin(ang) * rad;
    if (i === 0) gr.moveTo(px, py);
    else gr.lineTo(px, py);
  }
  gr.closePath();
  gr.fillPath();
  gr.generateTexture(key, r * 2, r * 2 + 3);
  gr.destroy();
};

const makeLock = (scene: Phaser.Scene): void => {
  const gr = g(scene);
  gr.lineStyle(6, 0x8a93b0, 1);
  gr.beginPath();
  gr.arc(20, 18, 11, Math.PI, 0, false);
  gr.strokePath();
  gr.fillStyle(0x8a93b0, 1);
  gr.fillRoundedRect(4, 18, 32, 22, 6);
  gr.fillStyle(0x4a5372, 1);
  gr.fillCircle(20, 28, 4);
  gr.generateTexture('medalLocked', 40, 44);
  gr.destroy();
};

/** Medal badges match the podium ghost tints used in Race.ts (gold/silver/bronze). */
const makeMedals = (scene: Phaser.Scene): void => {
  makeMedal(scene, 'medalGold', PALETTE.ghostRecord, 0xb8892a);
  makeMedal(scene, 'medalSilver', 0xdde4f2, 0x9aa4c2);
  makeMedal(scene, 'medalBronze', 0xdb9a66, 0x9a643a);
  makeLock(scene);
};

export const generateAllTextures = (scene: Phaser.Scene): void => {
  makeSky(scene);
  makeHill(scene, 'hillFar', 1600, 260, PALETTE.hillFar, 0.7);
  makeHill(scene, 'hillNear', 1600, 220, PALETTE.hillNear, 1.3);
  makeWheel(scene);
  makeBuggy(scene);
  makeBoost(scene);
  makeFlag(scene);
  makeCloud(scene);
  makeParticles(scene);
  makeHandle(scene);
  makePedals(scene);
  makeMedals(scene);
};
