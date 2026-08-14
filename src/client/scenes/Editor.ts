import * as Phaser from 'phaser';
import { navigateTo } from '@devvit/web/client';
import type { InitResponse, Track } from '../../shared/types';
import {
  BASE_Y,
  DEFAULT_NODES,
  FLAT_APRON,
  MAX_BOOSTS,
  MAX_NODES,
  MAX_Y,
  MIN_NODES,
  MIN_Y,
  NODE_DX,
  dayKey,
  formatMs,
} from '../../shared/track';
import { addBackground } from '../bg';
import { showPublishModal, showWordPrompt, setBusy } from '../dom';
import { publishTrack } from '../net';
import { generateWordTrack } from '../../shared/wordtrack';
import { track as trackEvent } from '../analytics';
import { buildTerrain, drawTerrain, drawTrackDecor, type TerrainData } from '../terrain';
import { PALETTE } from '../textures';
import { makeButton, restartOnResize, textStyle, toast, type Button } from '../ui';
import { sfx } from '../sfx';
import type { EditorState } from './Race';

type TestResult = { timeMs: number; ghost: { timeMs: number; fps: number; frames: number[] } };

type EditorParams = {
  init: InitResponse;
  editorState?: EditorState;
  testResult?: TestResult;
};

export class Editor extends Phaser.Scene {
  private initData!: InitResponse;
  private nodes: number[] = [];
  private boosts: number[] = [];
  private trackName = '';
  private tested: TestResult | null = null;

  /** World container — panned/scaled instead of the camera so screen UI stays clickable. */
  private world!: Phaser.GameObjects.Container;
  private worldScale = 1;
  private terrainGr!: Phaser.GameObjects.Graphics;
  private terrainData!: TerrainData;
  private handles: Phaser.GameObjects.Image[] = [];
  private decor: Phaser.GameObjects.GameObject[] = [];
  private dirty = false;
  private boostMode = false;
  private draggingHandle = false;
  private panLastX: number | null = null;

  private publishBtn!: Button;
  private testBtn!: Button;
  private boostBtn!: Button;
  private wordBtn!: Button;
  private lengthLabel!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super('Editor');
  }

  init(data: EditorParams): void {
    this.init2(data);
  }

  private init2(data: EditorParams): void {
    this.initData = data.init;
    if (data.editorState) {
      this.nodes = [...data.editorState.nodes];
      this.boosts = [...data.editorState.boosts];
      this.trackName = data.editorState.name;
    } else {
      // inviting default: gentle rolling hills
      this.nodes = Array.from({ length: DEFAULT_NODES }, (_, i) => {
        if (i < FLAT_APRON || i >= DEFAULT_NODES - FLAT_APRON) return 0;
        return Math.round(Math.sin((i - FLAT_APRON) * 0.6) * 60);
      });
      this.boosts = [];
      this.trackName = '';
    }
    this.tested = data.testResult ?? null;
    this.boostMode = false;
    this.draggingHandle = false;
    this.panLastX = null;
    this.handles = [];
    this.decor = [];
  }

  create(): void {
    restartOnResize(this, () => ({
      init: this.initData,
      editorState: this.editorState(),
      testResult: this.tested ?? undefined,
    }));
    addBackground(this);

    const w = this.scale.width;
    const h = this.scale.height;
    this.worldScale = Phaser.Math.Clamp(h / 950, 0.42, 0.95);
    this.world = this.add.container(60, h * 0.64 - BASE_Y * this.worldScale);
    this.world.setScale(this.worldScale);

    this.terrainGr = this.add.graphics();
    this.terrainGr.setDepth(-10);
    this.world.add(this.terrainGr);
    this.rebuildTerrain();
    this.rebuildHandles();
    this.setupDragHandlers();

    this.buildToolbar();

    // pan the world container by dragging empty space (camera stays fixed)
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y < this.toolbarHeight()) return;
      this.panLastX = p.x;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || this.draggingHandle || this.panLastX === null) return;
      this.world.x += p.x - this.panLastX;
      this.panLastX = p.x;
      const trackW = ((this.nodes.length - 1) * NODE_DX + 500) * this.worldScale;
      const minX = Math.min(60, w - trackW);
      this.world.x = Phaser.Math.Clamp(this.world.x, minX, 220);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const moved = this.panLastX !== null && Math.abs(p.x - (p.downX ?? p.x)) > 12;
      this.panLastX = null;
      if (this.boostMode && !moved && !this.draggingHandle && p.y > this.toolbarHeight()) {
        this.toggleBoostAt((p.x - this.world.x) / this.worldScale);
      }
    });

    if (this.tested) {
      toast(this, `✅ Test run saved: ${formatMs(this.tested.timeMs)} — ready to publish!`, PALETTE.textGood);
    } else {
      toast(this, 'Drag the orange handles to sculpt your track ⛰', PALETTE.textDim);
    }
  }

  override update(): void {
    if (this.dirty) {
      this.dirty = false;
      this.rebuildTerrain();
    }
  }

  private toolbarHeight(): number {
    return Phaser.Math.Clamp(this.scale.width / 640, 0.7, 1.15) * 118;
  }

  // -------------------------------------------------------------------------
  // Terrain & handles
  // -------------------------------------------------------------------------

  private currentTrack(): Track {
    return {
      v: 1,
      name: this.trackName || 'Untitled',
      owner: this.initData.username ?? 'you',
      nodes: this.nodes,
      dx: NODE_DX,
      boosts: this.boosts,
      day: dayKey(),
    };
  }

  private rebuildTerrain(): void {
    this.terrainData = buildTerrain(this.currentTrack());
    drawTerrain(this.terrainGr, this.terrainData);
    this.decor.forEach((d) => d.destroy());
    this.decor = [];
    const before = this.children.list.length;
    drawTrackDecor(this, this.currentTrack(), this.terrainData);
    // capture what decor added, move it into the world container
    this.decor = this.children.list.slice(before);
    for (const d of this.decor) {
      this.world.add(d);
    }
  }

  private rebuildHandles(): void {
    this.handles.forEach((hd) => hd.destroy());
    this.handles = [];
    for (let i = FLAT_APRON; i < this.nodes.length - FLAT_APRON; i++) {
      const img = this.add
        .image(i * NODE_DX, BASE_Y + (this.nodes[i] ?? 0), 'handle')
        .setDepth(20)
        .setScale(1.35)
        .setInteractive({ useHandCursor: true, draggable: true });
      img.setData('index', i);
      this.world.add(img);
      this.handles.push(img);
    }
  }

  private setupDragHandlers(): void {
    this.input.on('dragstart', () => {
      this.draggingHandle = true;
    });
    this.input.on(
      'drag',
      (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, _dragX: number, dragY: number) => {
        const img = obj as Phaser.GameObjects.Image;
        const i = img.getData('index') as number;
        if (i === undefined) return;
        const y = Phaser.Math.Clamp(Math.round(dragY / 10) * 10, BASE_Y + MIN_Y, BASE_Y + MAX_Y);
        img.y = y;
        if (this.nodes[i] !== y - BASE_Y) {
          this.nodes[i] = y - BASE_Y;
          this.invalidateTest();
          this.dirty = true;
        }
      }
    );
    this.input.on('dragend', () => {
      this.draggingHandle = false;
      this.dirty = true;
    });
  }

  private toggleBoostAt(worldX: number): void {
    const maxX = (this.nodes.length - 1) * NODE_DX;
    const x = Math.round(worldX / 20) * 20;
    if (x < NODE_DX || x > maxX - NODE_DX) return;
    const nearIdx = this.boosts.findIndex((b) => Math.abs(b - x) < 70);
    if (nearIdx >= 0) {
      this.boosts.splice(nearIdx, 1);
      sfx.pop();
    } else {
      if (this.boosts.length >= MAX_BOOSTS) {
        toast(this, `Max ${MAX_BOOSTS} boost pads!`, PALETTE.textBad);
        sfx.error();
        return;
      }
      this.boosts.push(x);
      sfx.boost();
    }
    this.invalidateTest();
    this.dirty = true;
  }

  private changeLength(delta: number): void {
    const n = this.nodes.length + delta;
    if (n < MIN_NODES || n > MAX_NODES) {
      sfx.error();
      return;
    }
    if (delta > 0) {
      const at = this.nodes.length - FLAT_APRON;
      this.nodes.splice(at, 0, this.nodes[at - 1] ?? 0);
    } else {
      this.nodes.splice(this.nodes.length - FLAT_APRON - 1, 1);
    }
    // keep aprons flat
    for (let i = 0; i < FLAT_APRON; i++) {
      this.nodes[i] = 0;
      this.nodes[this.nodes.length - 1 - i] = this.nodes[this.nodes.length - 1 - FLAT_APRON] ?? 0;
    }
    const maxX = (this.nodes.length - 1) * NODE_DX;
    this.boosts = this.boosts.filter((b) => b > NODE_DX && b < maxX - NODE_DX);
    this.invalidateTest();
    this.dirty = true;
    this.rebuildHandles();
    this.updateToolbar();
    sfx.click();
  }

  /** "Make course generating easier": type any word, get a starting track. */
  private async generateFromWord(): Promise<void> {
    const word = await showWordPrompt();
    if (!word) return;
    const result = generateWordTrack(word);
    if (!result) {
      toast(this, 'Could not generate a track from that word.', PALETTE.textBad);
      return;
    }
    trackEvent('word_track', word);
    this.nodes = result.nodes;
    this.boosts = result.boosts;
    this.trackName = result.suggestedName;
    this.tested = null;
    this.dirty = true;
    this.rebuildHandles();
    this.updateToolbar();
    toast(this, `🔤 "${result.suggestedName}" generated — test it or tweak it!`, PALETTE.textGood);
    sfx.click();
  }

  private invalidateTest(): void {
    if (this.tested) {
      this.tested = null;
      toast(this, 'Track changed — run a new test before publishing', PALETTE.textDim);
    }
    this.updateToolbar();
  }

  // -------------------------------------------------------------------------
  // Toolbar
  // -------------------------------------------------------------------------

  private buildToolbar(): void {
    const w = this.scale.width;
    // scale down further on phones so two rows of controls always fit
    const s = Phaser.Math.Clamp(w / 640, 0.7, 1.15);
    const barH = 118 * s;
    const pad = Math.max(8, 10 * s);

    const bar = this.add.graphics().setScrollFactor(0).setDepth(90);
    bar.fillStyle(PALETTE.uiPanel, 0.88);
    bar.fillRect(0, 0, w, barH);
    bar.lineStyle(2, PALETTE.uiPanelLight, 1);
    bar.lineBetween(0, barH, w, barH);

    const row1 = 32 * s;
    const row2 = 84 * s;
    const secondary = { color: PALETTE.uiPanelLight, textColor: '#ffffff' };
    const place = (b: Button): void => {
      b.container.setScrollFactor(0).setDepth(100);
    };

    // --- row 1: ✕ … TEST | PUBLISH (right-anchored) ---
    const back = makeButton(this, pad + 22 * s, row1, 44 * s, 40 * s, '✕', () => this.scene.start('Menu'), secondary);
    place(back);

    const pubW = 108 * s;
    const testW = 92 * s;
    const pubX = w - pad - pubW / 2;
    const testX = w - pad - pubW - 10 - testW / 2;
    this.testBtn = makeButton(this, testX, row1, testW, 44 * s, '▶ TEST', () => this.startTest(), {
      fontSize: 15 * s,
    });
    place(this.testBtn);
    this.publishBtn = makeButton(this, pubX, row1, pubW, 44 * s, '🚩 PUBLISH', () => void this.publish(), {
      color: PALETTE.uiGood,
      fontSize: 13 * s,
    });
    place(this.publishBtn);

    // title only if there's room between ✕ and TEST
    const titleSpace = testX - testW / 2 - (pad + 44 * s);
    if (titleSpace > 110) {
      this.add
        .text((pad + 44 * s + testX - testW / 2) / 2, row1, 'TRACK EDITOR', textStyle(13 * s, PALETTE.textDim))
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(100);
    }

    // --- row 2: BOOST … − length + (right-anchored) ---
    const boostW = 104 * s;
    this.boostBtn = makeButton(
      this,
      pad + boostW / 2,
      row2,
      boostW,
      38 * s,
      '🚀 BOOST',
      () => {
        this.boostMode = !this.boostMode;
        this.boostBtn.setLabel(this.boostMode ? '🚀 DONE' : '🚀 BOOST');
        this.handles.forEach((hd) => hd.setVisible(!this.boostMode));
        toast(
          this,
          this.boostMode ? 'Tap the ground to add/remove boost pads' : 'Boost mode off',
          PALETTE.textAccent
        );
      },
      { ...secondary, fontSize: 12 * s }
    );
    place(this.boostBtn);

    const wordW = 84 * s;
    this.wordBtn = makeButton(
      this,
      pad + boostW + 10 + wordW / 2,
      row2,
      wordW,
      38 * s,
      '🔤 WORD',
      () => void this.generateFromWord(),
      { ...secondary, fontSize: 12 * s }
    );
    place(this.wordBtn);

    const btnW = 48 * s;
    const labelW = 70 * s;
    const plusX = w - pad - btnW / 2;
    const labelX = plusX - btnW / 2 - 6 - labelW / 2;
    const minusX = labelX - labelW / 2 - 6 - btnW / 2;
    const plus = makeButton(this, plusX, row2, btnW, 38 * s, '+', () => this.changeLength(1), secondary);
    const minus = makeButton(this, minusX, row2, btnW, 38 * s, '−', () => this.changeLength(-1), secondary);
    place(plus);
    place(minus);
    this.lengthLabel = this.add
      .text(labelX, row2, '', textStyle(14 * s, '#ffffff'))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(100);

    this.statusText = this.add
      .text(w - pad, barH + 8, '', textStyle(11 * s, PALETTE.textDim))
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);

    this.updateToolbar();
  }

  private updateToolbar(): void {
    if (!this.lengthLabel) return;
    const km = ((this.nodes.length - 1) * NODE_DX) / 1000;
    this.lengthLabel.setText(`${km.toFixed(1)} km`);
    const canPublish = !!this.tested && !!this.initData.username;
    this.publishBtn.setEnabled(canPublish);
    this.statusText?.setText(
      !this.initData.username
        ? 'log in to publish'
        : this.tested
          ? `✅ test: ${formatMs(this.tested.timeMs)}`
          : 'test drive required to publish'
    );
  }

  // -------------------------------------------------------------------------
  // Test & publish
  // -------------------------------------------------------------------------

  private editorState(): EditorState {
    return { nodes: [...this.nodes], boosts: [...this.boosts], name: this.trackName };
  }

  private startTest(): void {
    trackEvent('test_drive', `${this.nodes.length} nodes`);
    this.scene.start('Race', {
      track: this.currentTrack(),
      arena: 'test',
      ghosts: this.tested
        ? { top: [{ user: this.initData.username ?? 'you', ...this.tested.ghost }], mine: null }
        : null,
      init: this.initData,
      editorState: this.editorState(),
    });
  }

  private async publish(): Promise<void> {
    if (!this.tested) return;
    const suggested = this.trackName || `${this.initData.username ?? 'Rally'}'s Run`;
    const name = await showPublishModal(
      suggested,
      `Your test run (${formatMs(this.tested.timeMs)}) becomes the record to beat.`
    );
    if (!name) return;
    this.trackName = name;
    setBusy(true);
    try {
      const res = await publishTrack({
        name,
        nodes: this.nodes,
        dx: NODE_DX,
        boosts: this.boosts,
        ghost: this.tested.ghost,
      });
      setBusy(false);
      trackEvent('publish_track', name);
      toast(this, '🎉 Track published! Taking you there…', PALETTE.textGood);
      sfx.record();
      this.time.delayedCall(900, () => navigateTo(res.url));
    } catch (e) {
      setBusy(false);
      toast(this, e instanceof Error ? e.message : 'Publish failed — try again', PALETTE.textBad);
      sfx.error();
    }
  }
}
