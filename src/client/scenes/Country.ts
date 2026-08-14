import * as Phaser from 'phaser';
import type { CountryResponse, CountryStatus, GhostsResponse, InitResponse } from '../../shared/types';
import { generateCountryTrack } from '../../shared/countries';
import { formatMs } from '../../shared/track';
import { addBackground } from '../bg';
import { fetchCountries, fetchGhosts } from '../net';
import { PALETTE } from '../textures';
import { makeButton, restartOnResize, textStyle, toast } from '../ui';
import { sfx, unlockAudio } from '../sfx';
import { track as trackEvent } from '../analytics';

type CountryParams = { init: InitResponse };

const DRAG_THRESHOLD = 6;

export class Country extends Phaser.Scene {
  private initData!: InitResponse;
  private busy = false;

  /** Scrollable card grid — country list can be longer than the screen. */
  private gridContainer!: Phaser.GameObjects.Container;
  private gridTop = 0;
  private contentHeight = 0;
  private dragStartY: number | null = null;
  private dragStartContainerY = 0;
  private isDraggingGrid = false;

  constructor() {
    super('Country');
  }

  init(data: CountryParams): void {
    this.initData = data.init;
    this.busy = false;
    this.contentHeight = 0;
    this.dragStartY = null;
    this.isDraggingGrid = false;
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
      .text(cx, h * 0.055, '🌍 COUNTRY CHALLENGE', {
        ...textStyle(24 * s, '#ffffff', 6),
        fontStyle: 'bold italic',
      })
      .setOrigin(0.5);
    this.add
      .text(cx, h * 0.1, 'race for the crown of every nation', textStyle(12 * s, PALETTE.textDim))
      .setOrigin(0.5);

    makeButton(this, 34 * s, 28 * s, 44 * s, 38 * s, '✕', () => this.scene.start('Menu'), {
      color: PALETTE.uiPanelLight,
      textColor: '#ffffff',
    });

    this.gridTop = h * 0.2;
    this.gridContainer = this.add.container(0, this.gridTop);
    this.setupScroll(h);

    const loading = this.add
      .text(cx, h * 0.5, 'Loading…', textStyle(16 * s, PALETTE.textDim))
      .setOrigin(0.5);

    void fetchCountries()
      .then((data) => {
        loading.destroy();
        this.renderCountries(data, cx, w, s);
      })
      .catch(() => {
        loading.setText('Could not load countries. Tap to retry.');
        loading.setInteractive({ useHandCursor: true }).once('pointerup', () => this.scene.restart());
      });
  }

  /**
   * Drag-to-scroll (touch/mouse) + wheel-scroll (desktop). The lower scroll
   * bound is whatever keeps the content's bottom edge from passing above the
   * viewport's bottom edge — never scrolls past the end, and never scrolls at
   * all if everything already fits.
   */
  private setupScroll(h: number): void {
    const bottomMargin = 16;
    const clampY = (y: number): number => {
      const viewportBottom = h - bottomMargin;
      const minY = Math.min(this.gridTop, viewportBottom - this.contentHeight);
      return Phaser.Math.Clamp(y, minY, this.gridTop);
    };

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.isDraggingGrid = false;
      this.dragStartY = p.y;
      this.dragStartContainerY = this.gridContainer.y;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || this.dragStartY === null) return;
      const dy = p.y - this.dragStartY;
      if (Math.abs(dy) > DRAG_THRESHOLD) this.isDraggingGrid = true;
      if (this.isDraggingGrid) {
        this.gridContainer.y = clampY(this.dragStartContainerY + dy);
      }
    });
    this.input.on('pointerup', () => {
      this.dragStartY = null;
    });
    this.input.on(
      'wheel',
      (_p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
        this.gridContainer.y = clampY(this.gridContainer.y - dy);
      }
    );
  }

  private renderCountries(data: CountryResponse, cx: number, w: number, s: number): void {
    const cols = 2;
    const cardW = Math.min(230 * s, w * 0.44);
    const cardH = 92 * s;
    const gapX = 16 * s;
    const gapY = 12 * s;
    const gridW = cols * cardW + gapX;
    const startX = cx - gridW / 2 + cardW / 2;

    data.countries.forEach((country, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + gapX);
      const y = row * (cardH + gapY);
      this.countryCard(x, y, cardW, cardH, country, s);
    });

    const rows = Math.ceil(data.countries.length / cols);
    this.contentHeight = rows * (cardH + gapY);
  }

  private countryCard(x: number, y: number, w: number, h: number, country: CountryStatus, s: number): void {
    const container = this.add.container(x, y);
    this.gridContainer.add(container);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.3);
    bg.fillRoundedRect(-w / 2, -h / 2 + 3, w, h, 12);
    bg.fillStyle(PALETTE.uiPanelLight, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h - 3, 12);
    bg.lineStyle(2, country.championUser ? PALETTE.uiAccent : 0x3a4c78, 1);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h - 3, 12);
    container.add(bg);

    container.add(
      this.add
        .text(-w / 2 + 12 * s, -h / 2 + 8 * s, `${country.flag} ${country.name}`, textStyle(12.5 * s, '#ffffff'))
        .setOrigin(0, 0)
    );

    const championText = country.championUser
      ? `👑 u/${country.championUser} · ${formatMs(country.championMs ?? 0)}`
      : 'no champion yet';
    container.add(
      this.add
        .text(
          -w / 2 + 12 * s,
          h / 2 - 36 * s,
          championText,
          textStyle(10.5 * s, country.championUser ? PALETTE.textAccent : PALETTE.textDim)
        )
        .setOrigin(0, 0)
    );

    if (country.myBestMs != null) {
      container.add(
        this.add
          .text(-w / 2 + 12 * s, h / 2 - 18 * s, `you: ${formatMs(country.myBestMs)}`, textStyle(10 * s, '#ffffff'))
          .setOrigin(0, 0)
      );
    }

    container.setSize(w, h);
    container.setInteractive({ useHandCursor: true });
    container.on('pointerover', () => this.tweens.add({ targets: container, scale: 1.03, duration: 90 }));
    container.on('pointerout', () => this.tweens.add({ targets: container, scale: 1, duration: 90 }));
    container.on('pointerup', () => {
      if (this.isDraggingGrid) return;
      void this.startCountry(country.code);
    });
  }

  private async startCountry(code: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    trackEvent('country_open', code);
    sfx.click();
    const track = generateCountryTrack(code);
    if (!track) {
      toast(this, 'Could not load that country.', PALETTE.textBad);
      this.busy = false;
      return;
    }
    let ghosts: GhostsResponse | null = null;
    try {
      ghosts = await fetchGhosts('country', code);
    } catch {
      // race without ghosts rather than blocking
    }
    this.scene.start('Race', { track, arena: 'country', countryCode: code, ghosts, init: this.initData });
  }
}
