import * as Phaser from 'phaser';
import { PALETTE } from '../textures';
import { makeButton, makePanel, restartOnResize, textStyle, type Button } from '../ui';
import { isMuted, setMuted } from '../sfx';
import { controlLayout } from '../controls';

/**
 * Screen-space UI overlay for the Race scene.
 * Runs as a parallel scene with its own static camera, because Phaser input
 * hit-testing does not play well with scrollFactor(0) under a moving/zoomed camera.
 */

export type HudInfo = {
  timeText: string;
  gap: { text: string; color: string } | null;
};

export type HudHost = {
  getHudInfo: () => HudInfo;
  uiRestart: () => void;
  uiExit: () => void;
};

export type PanelButtonSpec = {
  label: string;
  onClick: () => void;
  style?: 'primary' | 'secondary' | 'dim';
};

export type PanelSpec = {
  title: string;
  titleColor: string;
  big?: string;
  lines: { text: string; color: string }[];
  buttons: PanelButtonSpec[];
  /** Compact side-by-side buttons (share/brag/join) above the main stack. */
  social?: PanelButtonSpec[];
};

export class Hud extends Phaser.Scene {
  private host!: HudHost;
  private timerText!: Phaser.GameObjects.Text;
  private gapText!: Phaser.GameObjects.Text;
  private panelObjects: Phaser.GameObjects.GameObject[] = [];
  private muteBtn!: Button;

  constructor() {
    super('Hud');
  }

  init(data: { host: HudHost }): void {
    this.host = data.host;
    this.panelObjects = [];
  }

  create(): void {
    restartOnResize(this, () => ({ host: this.host }));
    const w = this.scale.width;
    const h = this.scale.height;
    const s = Phaser.Math.Clamp(Math.min(w / 640, h / 640), 0.75, 1.3);

    this.timerText = this.add.text(w / 2, 16 * s, '0.00', textStyle(30 * s, '#ffffff', 6)).setOrigin(0.5, 0);
    this.gapText = this.add.text(w / 2, 56 * s, '', textStyle(15 * s, PALETTE.textDim, 4)).setOrigin(0.5, 0);

    makeButton(this, 34 * s, 34 * s, 48 * s, 44 * s, '✕', () => this.host.uiExit(), {
      color: PALETTE.uiPanel,
      textColor: '#ffffff',
    });
    makeButton(this, w - 34 * s, 34 * s, 48 * s, 44 * s, '↻', () => this.host.uiRestart(), {
      color: PALETTE.uiPanel,
      textColor: '#ffffff',
    });
    this.muteBtn = makeButton(
      this,
      w - 92 * s,
      34 * s,
      48 * s,
      44 * s,
      isMuted() ? '🔇' : '🔊',
      () => {
        setMuted(!isMuted());
        this.muteBtn.setLabel(isMuted() ? '🔇' : '🔊');
      },
      { color: PALETTE.uiPanel, textColor: '#ffffff' }
    );

    // touch controls (visual affordances — hit-testing happens in Race with the same layout)
    const layout = controlLayout(w, h);
    const drawControl = (r: { cx: number; cy: number; w: number }, key: string, caption: string): void => {
      this.add
        .image(r.cx, r.cy, key)
        .setDisplaySize(r.w, r.w)
        .setAlpha(0.82);
      this.add
        .text(r.cx, r.cy + r.w / 2 + 4, caption, textStyle(11 * s, 'rgba(255,255,255,0.65)', 3))
        .setOrigin(0.5, 0);
    };
    drawControl(layout.brake, 'pedalBrake', 'BRAKE');
    drawControl(layout.leanFwd, 'pedalLeanFwd', 'LEAN');
    drawControl(layout.leanBack, 'pedalLeanBack', 'LEAN');
    drawControl(layout.gas, 'pedalGas', 'GAS');
  }

  override update(): void {
    if (!this.host || !this.timerText) return;
    const info = this.host.getHudInfo();
    this.timerText.setText(info.timeText);
    if (info.gap) {
      this.gapText.setText(info.gap.text).setColor(info.gap.color).setVisible(true);
    } else {
      this.gapText.setVisible(false);
    }
  }

  /** Big center text that pops in and fades (countdown, GO, WRECKED). */
  flashText(label: string, color: string, size = 64, holdMs = 260): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const t = this.add
      .text(w / 2, h * 0.38, label, textStyle(size, color, 8))
      .setOrigin(0.5)
      .setDepth(150)
      .setScale(1.6)
      .setAlpha(0);
    this.tweens.add({
      targets: t,
      scale: 1,
      alpha: 1,
      duration: 180,
      ease: 'Back.Out',
      onComplete: () => {
        this.tweens.add({
          targets: t,
          alpha: 0,
          scale: 0.7,
          delay: holdMs,
          duration: 220,
          onComplete: () => t.destroy(),
        });
      },
    });
  }

  showPanel(spec: PanelSpec): void {
    this.clearPanel();
    const w = this.scale.width;
    const h = this.scale.height;
    const s = Phaser.Math.Clamp(Math.min(w / 640, h / 640), 0.72, 1.2);
    const pw = Math.min(430 * s, w * 0.92);
    const ph = Math.min((spec.social?.length ? 490 : 430) * s, h * 0.86);

    const dim = this.add
      .rectangle(w / 2, h / 2, w * 2, h * 2, 0x060a14, 0.5)
      .setDepth(190)
      .setInteractive();
    const panel = makePanel(this, w / 2, h / 2, pw, ph);
    panel.setDepth(200).setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 260, ease: 'Back.Out' });

    panel.add(this.add.text(0, -ph / 2 + 40 * s, spec.title, textStyle(23 * s, spec.titleColor)).setOrigin(0.5));
    if (spec.big) {
      panel.add(this.add.text(0, -ph / 2 + 95 * s, spec.big, textStyle(44 * s, '#ffffff')).setOrigin(0.5));
    }
    spec.lines.forEach((l, i) => {
      panel.add(
        this.add.text(0, -ph / 2 + (138 + i * 27) * s, l.text, textStyle(15 * s, l.color)).setOrigin(0.5)
      );
    });

    const bw = pw * 0.8;
    const n = spec.buttons.length;

    // social row sits above the main button stack
    if (spec.social?.length) {
      const social = spec.social;
      const rowY = ph / 2 - (44 + n * 56) * s;
      const gap = 8 * s;
      const sw = (bw - gap * (social.length - 1)) / social.length;
      social.forEach((b, i) => {
        const x = -bw / 2 + sw / 2 + i * (sw + gap);
        const btn = makeButton(
          this,
          x,
          rowY,
          sw,
          40 * s,
          b.label,
          () => b.onClick(),
          { color: PALETTE.uiPanelLight, textColor: '#ffffff', fontSize: 12.5 * s }
        );
        panel.add(btn.container);
      });
    }

    spec.buttons.forEach((b, i) => {
      const fromBottom = n - 1 - i;
      const y = ph / 2 - (44 + fromBottom * 56) * s;
      const style = b.style ?? (i === 0 ? 'primary' : 'secondary');
      const btn = makeButton(
        this,
        0,
        y,
        bw,
        (style === 'primary' ? 52 : 44) * s,
        b.label,
        () => {
          this.clearPanel();
          b.onClick();
        },
        style === 'primary'
          ? {}
          : style === 'secondary'
            ? { color: PALETTE.uiPanelLight, textColor: '#ffffff' }
            : { color: PALETTE.uiPanel, textColor: '#aab4d4' }
      );
      panel.add(btn.container);
    });

    this.panelObjects = [dim, panel];
  }

  clearPanel(): void {
    this.panelObjects.forEach((o) => o.destroy());
    this.panelObjects = [];
  }
}
