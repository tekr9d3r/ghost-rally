import * as Phaser from 'phaser';
import { navigateTo, showShareSheet } from '@devvit/web/client';
import { track as trackEvent } from '../analytics';
import type { GhostsResponse, InitResponse, Track } from '../../shared/types';
import { dailyRallyNumber, formatMs, generateDailyTrack } from '../../shared/track';
import { addBackground } from '../bg';
import { fetchGhosts, fetchLeaderboard, fetchNextTrack } from '../net';
import { PALETTE } from '../textures';
import { makeButton, makeChip, makeDim, makePanel, restartOnResize, textStyle, toast } from '../ui';
import { sfx, unlockAudio } from '../sfx';

export class Menu extends Phaser.Scene {
  private initData!: InitResponse;
  private overlay: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Menu');
  }

  create(): void {
    this.initData = this.registry.get('init') as InitResponse;
    this.input.once('pointerdown', () => unlockAudio());
    this.overlay = null;
    restartOnResize(this);
    addBackground(this);

    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    const s = Phaser.Math.Clamp(Math.min(w / 640, h / 640), 0.72, 1.25);
    const isTrack = this.initData.kind === 'track' && !!this.initData.track;

    // --- Title ---
    const titleY = h * 0.15;
    if (isTrack) {
      const track = this.initData.track!;
      this.add
        .text(cx, titleY - 14 * s, 'GHOST RALLY', {
          ...textStyle(16 * s, PALETTE.textAccent),
          fontStyle: 'bold italic',
        })
        .setOrigin(0.5)
        .setAlpha(0.9);
      this.add
        .text(cx, titleY + 22 * s, track.name, {
          ...textStyle(38 * s, '#ffffff', 7),
          fontStyle: 'bold italic',
        })
        .setOrigin(0.5)
        .setShadow(0, 6, '#00000066', 8, false, true);
      this.add
        .text(cx, titleY + 54 * s, `a track by u/${track.owner}`, textStyle(13 * s, PALETTE.textDim))
        .setOrigin(0.5);
    } else {
      const title = this.add
        .text(cx, titleY, 'GHOST RALLY', {
          ...textStyle(54 * s, '#ffffff', 8),
          fontStyle: 'bold italic',
        })
        .setOrigin(0.5)
        .setShadow(0, 6, '#00000066', 8, false, true);
      this.tweens.add({ targets: title, y: titleY - 5, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }

    // --- Hero action ---
    const heroY = h * 0.46;
    const bw = Math.min(400 * s, w * 0.88);
    if (isTrack) {
      const rec = this.initData.record;
      const label = rec ? `BEAT  ${formatMs(rec.timeMs)}` : 'SET THE RECORD';
      makeButton(this, cx, heroY, bw, 72 * s, `🏁  ${label}`, () => void this.startPostRace(), {
        fontSize: 24 * s,
      });
      const bits: string[] = [];
      if (rec) bits.push(`👑 u/${rec.user}`);
      if (this.initData.myBestMs != null) bits.push(`your best ${formatMs(this.initData.myBestMs)}`);
      if ((this.initData.attempts ?? 0) > 0) {
        bits.push(`${this.initData.attempts} run${this.initData.attempts === 1 ? '' : 's'}`);
      }
      if (bits.length) makeChip(this, cx, heroY + 62 * s, bits.join('  ·  '), 13 * s);
    } else {
      const rallyNo = dailyRallyNumber(this.initData.day);
      makeButton(this, cx, heroY, bw, 72 * s, `🏁  DAILY RALLY  #${rallyNo}`, () => void this.startDaily(), {
        fontSize: 24 * s,
      });
      const rec = this.initData.dailyRecord;
      const line = rec ? `👑 u/${rec.user}  ·  ${formatMs(rec.timeMs)}` : 'no record yet — set the first ghost';
      makeChip(this, cx, heroY + 62 * s, line, 13 * s);
    }

    // --- Secondary actions: clear button cards ---
    const rowY = h * 0.72;
    const links: { icon: string; label: string; cb: () => void }[] = [
      {
        icon: '🎲',
        label: isTrack ? 'NEXT' : 'TRACKS',
        cb: () => void this.gotoNextTrack(),
      },
      {
        icon: '🛠',
        label: 'BUILD',
        cb: () => {
          trackEvent('editor_open', this.initData.kind);
          this.scene.start('Editor', { init: this.initData });
        },
      },
      { icon: '🏆', label: 'RANKS', cb: () => void this.showLeaderboard() },
    ];
    if (isTrack) {
      links.push({ icon: '📣', label: 'SHARE', cb: () => this.shareTrack() });
    }
    const nCards = links.length;
    const bwCard = Math.min(118 * s, (w * 0.92) / (nCards + 0.2));
    const spacing = bwCard + 12 * s;
    links.forEach((l, i) => {
      this.miniButton(cx + (i - (nCards - 1) / 2) * spacing, rowY, bwCard, 78 * s, l.icon, l.label, s, l.cb);
    });

    // --- Personal corner chip (only if there's something to show) ---
    const p = this.initData.player;
    if (p.username && (p.rp > 0 || p.streak > 1)) {
      const bits = [`⚡ ${p.rp}`];
      if (p.streak > 1) bits.push(`🔥 ${p.streak}`);
      makeChip(this, w - 70 * s, 26 * s, bits.join('  '), 12 * s).setAlpha(0.85);
    }

    // --- The chase, driving across the bottom ---
    this.addChase(w, h, s);
  }

  /** Compact button card: icon on top, label under — unmistakably tappable. */
  private miniButton(
    x: number,
    y: number,
    w: number,
    h: number,
    icon: string,
    label: string,
    s: number,
    cb: () => void
  ): void {
    const container = this.add.container(x, y);
    const bg = this.add.graphics();
    const draw = (dy: number, fill: number): void => {
      bg.clear();
      bg.fillStyle(0x000000, 0.35);
      bg.fillRoundedRect(-w / 2, -h / 2 + 4, w, h, 16);
      bg.fillStyle(fill, 1);
      bg.fillRoundedRect(-w / 2, -h / 2 + dy, w, h - 4, 16);
      bg.lineStyle(2, 0x3a4c78, 1);
      bg.strokeRoundedRect(-w / 2, -h / 2 + dy, w, h - 4, 16);
      bg.fillStyle(0xffffff, 0.07);
      bg.fillRoundedRect(-w / 2 + 3, -h / 2 + dy + 3, w - 6, (h - 4) * 0.42, 13);
    };
    draw(0, PALETTE.uiPanelLight);
    const iconText = this.add.text(0, -h * 0.17, icon, textStyle(24 * s)).setOrigin(0.5);
    const labelText = this.add.text(0, h * 0.22, label, textStyle(12.5 * s, '#dfe6fa')).setOrigin(0.5);
    container.add([bg, iconText, labelText]);
    container.setSize(w, h);
    container.setInteractive({ useHandCursor: true });
    container.on('pointerover', () => this.tweens.add({ targets: container, scale: 1.06, duration: 90 }));
    container.on('pointerout', () => {
      this.tweens.add({ targets: container, scale: 1, duration: 90 });
      draw(0, PALETTE.uiPanelLight);
    });
    container.on('pointerdown', () => draw(2, 0x2b3c63));
    container.on('pointerup', () => {
      draw(0, PALETTE.uiPanelLight);
      sfx.click();
      cb();
    });
  }

  /** Ghost being chased by the buggy along the bottom of the screen. */
  private addChase(w: number, h: number, s: number): void {
    const y = h * 0.9;
    const scale = 0.62 * s;

    const ghost = this.add.image(0, y, 'ghostBuggyRaw').setTint(PALETTE.ghostRecord).setAlpha(0.55).setScale(scale);
    const crown = this.add.text(0, y - 46 * scale, '👑', textStyle(15 * s)).setOrigin(0.5).setAlpha(0.85);

    const chassis = this.add.image(0, y, 'chassis').setScale(scale);
    const wheelL = this.add.image(0, y + 20 * scale, 'wheel').setScale(scale * 0.92);
    const wheelR = this.add.image(0, y + 20 * scale, 'wheel').setScale(scale * 0.92);

    const gap = 130 * s;
    const total = { t: 0 };
    this.tweens.add({
      targets: total,
      t: 1,
      duration: 11000,
      repeat: -1,
      onUpdate: () => {
        const x = -220 + (w + 440) * total.t;
        const bob = Math.sin(this.time.now / 90) * 2;
        ghost.setPosition(x + gap, y - 6 + Math.sin(this.time.now / 300) * 5);
        ghost.setAlpha(0.4 + Math.sin(this.time.now / 500) * 0.15);
        crown.setPosition(x + gap, y - 34 - 6 + Math.sin(this.time.now / 300) * 5);
        chassis.setPosition(x, y + bob);
        wheelL.setPosition(x - 36 * scale * (48 / 44), y + 22 * scale);
        wheelR.setPosition(x + 36 * scale * (48 / 44), y + 22 * scale);
        wheelL.rotation += 0.25;
        wheelR.rotation += 0.25;
      },
    });
  }

  // -------------------------------------------------------------------------

  private async startPostRace(): Promise<void> {
    const track = this.initData.track!;
    let ghosts: GhostsResponse | null = null;
    try {
      ghosts = await fetchGhosts('post');
    } catch {
      // race without ghosts rather than blocking
    }
    this.scene.start('Race', { track, arena: 'post', ghosts, init: this.initData });
  }

  private async startDaily(): Promise<void> {
    const track: Track = generateDailyTrack(this.initData.day);
    let ghosts: GhostsResponse | null = null;
    try {
      ghosts = await fetchGhosts('daily');
    } catch {
      /* ignore */
    }
    this.scene.start('Race', { track, arena: 'daily', ghosts, init: this.initData });
  }

  private shareTrack(): void {
    trackEvent('share', 'menu');
    const t = this.initData.track;
    const rec = this.initData.record;
    const challenge = rec ? `beat ${formatMs(rec.timeMs)} on` : 'race';
    void showShareSheet({
      title: 'Ghost Rally',
      text: `Think you can ${challenge} ${t?.name ?? 'this track'}? 👻🏁`,
    }).then(
      () => toast(this, 'Challenge shared! 📣', PALETTE.textGood),
      () => toast(this, 'Could not open share sheet', PALETTE.textBad)
    );
  }

  private async gotoNextTrack(): Promise<void> {
    trackEvent('next_track', 'menu');
    try {
      const next = await fetchNextTrack();
      if (next.url) {
        navigateTo(next.url);
      } else {
        toast(this, 'No community tracks yet — build the first one! 🛠', PALETTE.textAccent);
      }
    } catch {
      toast(this, 'Could not find a track. Try again.', PALETTE.textBad);
    }
  }

  private async showLeaderboard(): Promise<void> {
    if (this.overlay) return;
    const w = this.scale.width;
    const h = this.scale.height;
    const s = Phaser.Math.Clamp(Math.min(w / 640, h / 640), 0.72, 1.2);

    const dim = makeDim(this);
    const pw = Math.min(440 * s, w * 0.92);
    const ph = Math.min(520 * s, h * 0.86);
    const panel = makePanel(this, w / 2, h / 2, pw, ph);
    const overlay = this.add.container(0, 0, [dim, panel]);
    this.overlay = overlay;
    panel.setDepth(10);
    dim.setDepth(9);

    const title = this.add.text(0, -ph / 2 + 34, '🏆 LEADERBOARDS', textStyle(22 * s, '#ffffff')).setOrigin(0.5);
    panel.add(title);

    const closeBtn = makeButton(this, pw / 2 - 34, -ph / 2 + 34, 44, 40, '✕', () => this.closeOverlay(), {
      color: PALETTE.uiPanelLight,
      textColor: '#ffffff',
    });
    panel.add(closeBtn.container);

    const listY = -ph / 2 + 130;
    const rows: Phaser.GameObjects.Text[] = [];
    const renderRows = (lines: string[]): void => {
      rows.forEach((r) => r.destroy());
      rows.length = 0;
      lines.forEach((line, i) => {
        const t = this.add
          .text(-pw / 2 + 30, listY + i * 30 * s, line, textStyle(15 * s, i === 0 ? PALETTE.textAccent : '#ffffff'))
          .setOrigin(0, 0.5);
        panel.add(t);
        rows.push(t);
      });
    };
    renderRows(['Loading…']);

    trackEvent('leaderboard_open', this.initData.kind);
    try {
      const lb = await fetchLeaderboard();
      const tabs: { label: string; lines: string[] }[] = [
        ...(lb.track
          ? [
              {
                label: 'TRACK',
                lines: lb.track.length
                  ? lb.track.map((r) => `${r.rank}. u/${r.member} — ${formatMs(r.score)}`)
                  : ['No times on this track yet.'],
              },
            ]
          : []),
        {
          label: 'TODAY',
          lines: lb.daily.length
            ? lb.daily.map((r) => `${r.rank}. u/${r.member} — ${formatMs(r.score)}`)
            : ['No times yet today.', 'Race the Daily Rally!'],
        },
        {
          label: 'WEEK',
          lines: lb.weekly.length
            ? lb.weekly.map((r) => `${r.rank}. u/${r.member} — ${Math.round(r.score)} RP`)
            : ['Nobody has scored this week.'],
        },
        {
          label: 'ALL-TIME',
          lines: lb.allTime.length
            ? lb.allTime.map((r) => `${r.rank}. u/${r.member} — ${Math.round(r.score)} RP`)
            : ['Be the first on the board!'],
        },
      ];
      const meLine = (): string => {
        const parts: string[] = [];
        if (lb.me.trackRank) parts.push(`track #${lb.me.trackRank}`);
        if (lb.me.dailyRank) parts.push(`today #${lb.me.dailyRank}`);
        if (lb.me.weeklyRank) parts.push(`week #${lb.me.weeklyRank}`);
        if (lb.me.allTimeRank) parts.push(`all-time #${lb.me.allTimeRank}`);
        return parts.length ? `you: ${parts.join(' · ')}` : '';
      };

      let active = 0;
      const tabGap = 8;
      const tabW = (pw - 60 - tabGap * (tabs.length - 1)) / tabs.length;
      const tabButtons = tabs.map((tab, i) => {
        const btn = makeButton(
          this,
          -pw / 2 + 30 + tabW / 2 + i * (tabW + tabGap),
          -ph / 2 + 80,
          tabW,
          38 * s,
          tab.label,
          () => {
            active = i;
            renderRows(tabs[i]!.lines.slice(0, 10));
            tabButtons.forEach((b, j) => b.container.setAlpha(j === active ? 1 : 0.55));
          },
          { color: PALETTE.uiPanelLight, textColor: '#ffffff', fontSize: Math.min(14 * s, tabW / 5.2) }
        );
        panel.add(btn.container);
        return btn;
      });
      tabButtons.forEach((b, j) => b.container.setAlpha(j === 0 ? 1 : 0.55));
      renderRows(tabs[0]!.lines.slice(0, 10));

      const me = meLine();
      if (me) {
        const meText = this.add.text(0, ph / 2 - 30, me, textStyle(13 * s, PALETTE.textAccent)).setOrigin(0.5);
        panel.add(meText);
      }
    } catch {
      renderRows(['Could not load leaderboards.']);
    }
  }

  private closeOverlay(): void {
    this.overlay?.destroy(true);
    this.overlay = null;
    sfx.pop();
  }
}
