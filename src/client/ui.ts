import * as Phaser from 'phaser';
import { PALETTE } from './textures';
import { sfx } from './sfx';

const FONT = '"Trebuchet MS", "Segoe UI", Verdana, sans-serif';

/** Render text at native DPI — without this, text is blurry on mobile (DPR 2–3). */
const DPR = Math.min(
  typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  3
);

export const textStyle = (
  size: number,
  color: string = PALETTE.textMain,
  stroke = 0
): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FONT,
  fontSize: `${Math.round(size)}px`,
  fontStyle: 'bold',
  color,
  resolution: DPR,
  ...(stroke > 0 ? { stroke: '#0a0f1c', strokeThickness: stroke } : {}),
});

export type Button = {
  container: Phaser.GameObjects.Container;
  setEnabled: (enabled: boolean) => void;
  setLabel: (label: string) => void;
};

export const makeButton = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  onClick: () => void,
  opts?: { color?: number; fontSize?: number; textColor?: string }
): Button => {
  const color = opts?.color ?? PALETTE.uiAccent;
  const fontSize = opts?.fontSize ?? h * 0.42;
  const container = scene.add.container(x, y);
  const bg = scene.add.graphics();
  const draw = (fill: number, dy: number): void => {
    bg.clear();
    bg.fillStyle(0x000000, 0.35);
    bg.fillRoundedRect(-w / 2, -h / 2 + 4, w, h, h * 0.28);
    bg.fillStyle(fill, 1);
    bg.fillRoundedRect(-w / 2, -h / 2 + dy, w, h - 4, h * 0.28);
    bg.fillStyle(0xffffff, 0.14);
    bg.fillRoundedRect(-w / 2 + 3, -h / 2 + dy + 3, w - 6, (h - 4) * 0.45, h * 0.22);
  };
  draw(color, 0);
  const txt = scene.add
    .text(0, -2, label, textStyle(fontSize, opts?.textColor ?? '#1a1200'))
    .setOrigin(0.5);
  container.add([bg, txt]);
  container.setSize(w, h);
  let enabled = true;
  container.setInteractive({ useHandCursor: true });
  container.on('pointerover', () => {
    if (!enabled) return;
    scene.tweens.add({ targets: container, scale: 1.05, duration: 90 });
  });
  container.on('pointerout', () => {
    scene.tweens.add({ targets: container, scale: 1, duration: 90 });
    draw(enabled ? color : 0x555b6b, 0);
  });
  container.on('pointerdown', () => {
    if (!enabled) return;
    draw(color, 2);
    txt.setY(0);
  });
  container.on('pointerup', () => {
    if (!enabled) return;
    draw(color, 0);
    txt.setY(-2);
    sfx.click();
    onClick();
  });
  return {
    container,
    setEnabled: (e: boolean) => {
      enabled = e;
      container.setAlpha(e ? 1 : 0.55);
      draw(e ? color : 0x555b6b, 0);
      if (e) container.setInteractive({ useHandCursor: true });
    },
    setLabel: (l: string) => txt.setText(l),
  };
};

export const makePanel = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha = 0.92
): Phaser.GameObjects.Container => {
  const container = scene.add.container(x, y);
  const bg = scene.add.graphics();
  bg.fillStyle(0x000000, 0.4);
  bg.fillRoundedRect(-w / 2 + 5, -h / 2 + 7, w, h, 22);
  bg.fillStyle(PALETTE.uiPanel, alpha);
  bg.fillRoundedRect(-w / 2, -h / 2, w, h, 22);
  bg.lineStyle(2, PALETTE.uiPanelLight, 1);
  bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 22);
  container.add(bg);
  return container;
};

/** Small stat chip like "🔥 4-day streak". */
export const makeChip = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  fontSize = 15
): Phaser.GameObjects.Container => {
  const container = scene.add.container(x, y);
  const txt = scene.add.text(0, 0, label, textStyle(fontSize, PALETTE.textDim)).setOrigin(0.5);
  const w = txt.width + 26;
  const h = txt.height + 12;
  const bg = scene.add.graphics();
  bg.fillStyle(0x000000, 0.32);
  bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  bg.lineStyle(1.5, PALETTE.uiPanelLight, 0.9);
  bg.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  container.add([bg, txt]);
  return container;
};

export const toast = (scene: Phaser.Scene, message: string, color: string = PALETTE.textMain): void => {
  const cam = scene.cameras.main;
  const txt = scene.add
    .text(cam.width / 2, cam.height * 0.16, message, {
      ...textStyle(18, color, 5),
      align: 'center',
      wordWrap: { width: cam.width * 0.85 },
    })
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(1000)
    .setAlpha(0);
  scene.tweens.add({
    targets: txt,
    alpha: 1,
    y: cam.height * 0.13,
    duration: 220,
    ease: 'Back.Out',
    onComplete: () => {
      scene.tweens.add({
        targets: txt,
        alpha: 0,
        delay: 2100,
        duration: 350,
        onComplete: () => txt.destroy(),
      });
    },
  });
};

/**
 * Rebuild a UI scene when the viewport changes size (expanded mode, fullscreen,
 * rotation). Debounced; the listener is removed on scene shutdown.
 */
export const restartOnResize = (scene: Phaser.Scene, getData?: () => object): void => {
  let timer: Phaser.Time.TimerEvent | null = null;
  const handler = (): void => {
    timer?.remove(false);
    timer = scene.time.delayedCall(180, () => {
      if (scene.scene.isActive()) scene.scene.restart(getData?.());
    });
  };
  scene.scale.on('resize', handler);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off('resize', handler));
};

/** Fullscreen dim behind modals. */
export const makeDim = (scene: Phaser.Scene, alpha = 0.55): Phaser.GameObjects.Rectangle => {
  const cam = scene.cameras.main;
  return scene.add
    .rectangle(cam.width / 2, cam.height / 2, cam.width * 2, cam.height * 2, 0x060a14, alpha)
    .setScrollFactor(0)
    .setInteractive();
};
