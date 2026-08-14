import * as Phaser from 'phaser';
import type { CampaignResponse, GhostsResponse, InitResponse } from '../../shared/types';
import { generateCampaignTrack } from '../../shared/campaign';
import { formatMs } from '../../shared/track';
import { addBackground } from '../bg';
import { fetchCampaign, fetchGhosts } from '../net';
import { PALETTE } from '../textures';
import { makeButton, makeChip, restartOnResize, textStyle, toast } from '../ui';
import { sfx, unlockAudio } from '../sfx';
import { track as trackEvent } from '../analytics';

type CampaignParams = { init: InitResponse };

export class Campaign extends Phaser.Scene {
  private initData!: InitResponse;
  private busy = false;

  constructor() {
    super('Campaign');
  }

  init(data: CampaignParams): void {
    this.initData = data.init;
    this.busy = false;
  }

  create(): void {
    this.input.once('pointerdown', () => unlockAudio());
    restartOnResize(this, () => ({ init: this.initData }));
    addBackground(this);

    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    const s = Phaser.Math.Clamp(Math.min(w / 640, h / 640), 0.72, 1.25);

    this.add
      .text(cx, h * 0.08, '🎓 CAMPAIGN', {
        ...textStyle(30 * s, '#ffffff', 6),
        fontStyle: 'bold italic',
      })
      .setOrigin(0.5);
    this.add
      .text(cx, h * 0.13, 'race yourself first, then everyone else', textStyle(13 * s, PALETTE.textDim))
      .setOrigin(0.5);

    makeButton(this, 34 * s, 30 * s, 44 * s, 40 * s, '✕', () => this.scene.start('Menu'), {
      color: PALETTE.uiPanelLight,
      textColor: '#ffffff',
    });

    const loading = this.add
      .text(cx, h * 0.5, 'Loading…', textStyle(16 * s, PALETTE.textDim))
      .setOrigin(0.5);

    void fetchCampaign()
      .then((data) => {
        loading.destroy();
        this.renderStages(data, cx, h, w, s);
      })
      .catch(() => {
        loading.setText('Could not load campaign. Tap to retry.');
        loading.setInteractive({ useHandCursor: true }).once('pointerup', () => this.scene.restart());
      });
  }

  private renderStages(data: CampaignResponse, cx: number, h: number, w: number, s: number): void {
    const cols = 2;
    const cardW = Math.min(230 * s, w * 0.44);
    const cardH = 104 * s;
    const gapX = 16 * s;
    const gapY = 14 * s;
    const gridW = cols * cardW + gapX;
    const startX = cx - gridW / 2 + cardW / 2;
    const startY = h * 0.24;

    data.stages.forEach((stage, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);
      this.stageCard(x, y, cardW, cardH, i + 1, stage, s);
    });

    const bottomY = startY + Math.ceil(data.stages.length / cols) * (cardH + gapY) + 10 * s;
    if (data.completedAll && data.totalMs != null) {
      makeChip(this, cx, bottomY, `🏆 campaign cleared — total ${formatMs(data.totalMs)}`, 13 * s);
    } else {
      const done = data.stages.filter((st) => st.bestMs != null).length;
      makeChip(this, cx, bottomY, `${done} / ${data.stages.length} stages cleared`, 13 * s);
    }
  }

  private stageCard(
    x: number,
    y: number,
    w: number,
    h: number,
    num: number,
    stage: CampaignResponse['stages'][number],
    s: number
  ): void {
    const container = this.add.container(x, y);
    const bg = this.add.graphics();
    const fill = stage.locked ? 0x1a2338 : PALETTE.uiPanelLight;
    bg.fillStyle(0x000000, 0.3);
    bg.fillRoundedRect(-w / 2, -h / 2 + 3, w, h, 14);
    bg.fillStyle(fill, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h - 3, 14);
    if (!stage.locked) {
      bg.lineStyle(2, stage.medal ? PALETTE.uiAccent : 0x3a4c78, 1);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h - 3, 14);
    }
    container.add(bg);

    const nameColor = stage.locked ? '#5a6482' : '#ffffff';
    container.add(
      this.add
        .text(-w / 2 + 14 * s, -h / 2 + 12 * s, `${num}. ${stage.name}`, textStyle(13.5 * s, nameColor))
        .setOrigin(0, 0)
    );

    if (stage.locked) {
      container.add(this.add.image(w / 2 - 26 * s, 0, 'medalLocked').setScale(0.55 * s).setAlpha(0.8));
      container.add(
        this.add
          .text(-w / 2 + 14 * s, 6 * s, 'complete the stage before', textStyle(10.5 * s, PALETTE.textDim))
          .setOrigin(0, 0)
      );
      container.add(
        this.add
          .text(-w / 2 + 14 * s, 18 * s, 'this one to unlock it', textStyle(10.5 * s, PALETTE.textDim))
          .setOrigin(0, 0)
      );
      return;
    }

    if (stage.medal) {
      container.add(
        this.add.image(w / 2 - 26 * s, 4 * s, `medal${cap(stage.medal)}`).setScale(0.62 * s)
      );
    }

    const timeText = stage.bestMs != null ? formatMs(stage.bestMs) : 'not attempted';
    container.add(
      this.add
        .text(-w / 2 + 14 * s, h / 2 - 38 * s, timeText, textStyle(15 * s, stage.bestMs != null ? '#ffffff' : PALETTE.textDim))
        .setOrigin(0, 0)
    );
    container.add(
      this.add
        .text(-w / 2 + 14 * s, h / 2 - 18 * s, `🥇 ${formatMs(stage.gold)}`, textStyle(9.5 * s, 'rgba(255,255,255,0.4)'))
        .setOrigin(0, 0)
    );

    container.setSize(w, h);
    container.setInteractive({ useHandCursor: true });
    container.on('pointerover', () => this.tweens.add({ targets: container, scale: 1.03, duration: 90 }));
    container.on('pointerout', () => this.tweens.add({ targets: container, scale: 1, duration: 90 }));
    container.on('pointerup', () => void this.startStage(stage.id));
  }

  private async startStage(stageId: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    trackEvent('campaign_stage_open', stageId);
    sfx.click();
    const track = generateCampaignTrack(stageId);
    if (!track) {
      toast(this, 'Could not load that stage.', PALETTE.textBad);
      this.busy = false;
      return;
    }
    let ghosts: GhostsResponse | null = null;
    try {
      ghosts = await fetchGhosts('campaign', stageId);
    } catch {
      // race without ghosts rather than blocking
    }
    this.scene.start('Race', { track, arena: 'campaign', stageId, ghosts, init: this.initData });
  }
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
