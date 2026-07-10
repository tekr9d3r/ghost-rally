import * as Phaser from 'phaser';
import type { Track } from '../shared/types';
import { buildTerrainPolyline, terrainYAt, finishX, START_X } from '../shared/track';
import { PALETTE } from './textures';

export type TerrainData = {
  poly: { x: number; y: number }[];
  length: number;
  finishX: number;
};

export const buildTerrain = (track: Track): TerrainData => {
  const poly = buildTerrainPolyline(track.nodes, track.dx);
  const length = (track.nodes.length - 1) * track.dx;
  return { poly, length, finishX: finishX(track.nodes.length, track.dx) };
};

/** Draw the ground: dirt body, strata, grass lip. Call once per track. */
export const drawTerrain = (gr: Phaser.GameObjects.Graphics, data: TerrainData): void => {
  const { poly } = data;
  const bottom = 1600;
  gr.clear();

  gr.fillStyle(PALETTE.dirt, 1);
  gr.beginPath();
  gr.moveTo(poly[0]!.x - 300, bottom);
  gr.lineTo(poly[0]!.x - 300, poly[0]!.y);
  for (const p of poly) gr.lineTo(p.x, p.y);
  gr.lineTo(poly[poly.length - 1]!.x + 300, poly[poly.length - 1]!.y);
  gr.lineTo(poly[poly.length - 1]!.x + 300, bottom);
  gr.closePath();
  gr.fillPath();

  // darker strata band under the surface
  gr.fillStyle(PALETTE.dirtDark, 1);
  gr.beginPath();
  gr.moveTo(poly[0]!.x - 300, poly[0]!.y + 60);
  for (const p of poly) gr.lineTo(p.x, p.y + 60);
  gr.lineTo(poly[poly.length - 1]!.x + 300, poly[poly.length - 1]!.y + 60);
  gr.lineTo(poly[poly.length - 1]!.x + 300, bottom);
  gr.lineTo(poly[0]!.x - 300, bottom);
  gr.closePath();
  gr.fillPath();

  // grass lip
  gr.lineStyle(10, PALETTE.grass, 1);
  gr.beginPath();
  gr.moveTo(poly[0]!.x - 300, poly[0]!.y - 2);
  for (const p of poly) gr.lineTo(p.x, p.y - 2);
  gr.lineTo(poly[poly.length - 1]!.x + 300, poly[poly.length - 1]!.y - 2);
  gr.strokePath();
  gr.lineStyle(4, PALETTE.grassDark, 1);
  gr.beginPath();
  gr.moveTo(poly[0]!.x - 300, poly[0]!.y + 5);
  for (const p of poly) gr.lineTo(p.x, p.y + 5);
  gr.lineTo(poly[poly.length - 1]!.x + 300, poly[poly.length - 1]!.y + 5);
  gr.strokePath();
};

/** Create static matter bodies along the terrain surface. */
export const buildTerrainBodies = (scene: Phaser.Scene, data: TerrainData): void => {
  // extend flat ground well past both ends — the walls must sit ON the floor
  const first0 = data.poly[0]!;
  const last0 = data.poly[data.poly.length - 1]!;
  const ext = 700;
  const poly = [
    { x: first0.x - ext, y: first0.y },
    ...data.poly,
    { x: last0.x + ext, y: last0.y },
  ];
  const thickness = 26;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i]!;
    const b = poly[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) continue;
    const angle = Math.atan2(dy, dx);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    // offset the body down so its top edge sits on the surface line
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    scene.matter.add.rectangle(mx + nx * (thickness / 2), my + ny * (thickness / 2), len + 6, thickness, {
      isStatic: true,
      friction: 1,
      frictionStatic: 1,
      restitution: 0,
      label: 'terrain',
      chamfer: { radius: 0 },
    });
  }
  // tall walls at both ends (on top of the extended floor) so you can't leave the world
  scene.matter.add.rectangle(first0.x - 520, first0.y - 500, 80, 1600, { isStatic: true, label: 'wall' });
  scene.matter.add.rectangle(last0.x + 520, last0.y - 500, 80, 1600, { isStatic: true, label: 'wall' });
};

/** Start line, finish flag, boost pad sprites. Returns boost pad zones for the race. */
export const drawTrackDecor = (
  scene: Phaser.Scene,
  track: Track,
  data: TerrainData
): { x: number; y: number; angle: number }[] => {
  // start line
  const sy = terrainYAt(data.poly, START_X);
  scene.add
    .rectangle(START_X, sy - 40, 4, 80, 0xffffff, 0.35)
    .setDepth(-5);

  // finish flag
  const fy = terrainYAt(data.poly, data.finishX);
  scene.add.image(data.finishX, fy - 63, 'flag').setOrigin(0.1, 0.52).setDepth(-4);
  // subtle glow at finish
  scene.add.image(data.finishX, fy - 60, 'glow').setScale(1.6).setAlpha(0.4).setDepth(-6);

  // boost pads
  const pads: { x: number; y: number; angle: number }[] = [];
  for (const bx of track.boosts) {
    const by = terrainYAt(data.poly, bx);
    const ahead = terrainYAt(data.poly, bx + 30);
    const behind = terrainYAt(data.poly, bx - 30);
    const angle = Math.atan2(ahead - behind, 60);
    const img = scene.add.image(bx, by - 8, 'boost').setRotation(angle).setDepth(-3);
    scene.tweens.add({
      targets: img,
      alpha: 0.55,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    pads.push({ x: bx, y: by, angle });
  }
  return pads;
};
