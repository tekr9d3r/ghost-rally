/* global MatterJS */
import * as Phaser from 'phaser';
import type { FinishResponse, Ghost, GhostsResponse, InitResponse, Track } from '../../shared/types';
import { GHOST_FPS, MAX_GHOST_NUMBERS, START_X, formatMs, terrainYAt } from '../../shared/track';
import { submitFinish, fetchNextTrack } from '../net';
import { buildTerrain, buildTerrainBodies, drawTerrain, drawTrackDecor, type TerrainData } from '../terrain';
import { PALETTE } from '../textures';
import { textStyle, toast } from '../ui';
import { engineStart, engineStop, engineUpdate, sfx, unlockAudio } from '../sfx';
import { navigateTo } from '@devvit/web/client';
import { controlLayout, inRect, type ControlLayout } from '../controls';
import type { Hud, HudInfo, PanelSpec } from './Hud';

export type EditorState = {
  nodes: number[];
  boosts: number[];
  name: string;
};

export type RaceParams = {
  track: Track;
  arena: 'post' | 'daily' | 'test';
  ghosts: GhostsResponse | null;
  init: InitResponse;
  editorState?: EditorState;
};

type GhostRig = {
  ghost: Ghost;
  sprite: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  finished: boolean;
};

const MAX_SPIN = 0.8;
const REVERSE_SPIN = -0.9;
/** Lean torque (rad/frame² equivalent): strong in the air, gentler on the ground. */
const LEAN_AIR = 0.014;
const LEAN_GROUND = 0.007;
const MAX_LEAN_AV = 0.33;
/** Reaction torque when gassing on the ground — the nose lifts under acceleration. */
const WHEELIE_TORQUE = 0.0022;
/** Direct chassis acceleration while grounded (px/frame²) — wheels alone slip on hills. */
const DRIVE_ASSIST = 0.26;
const REVERSE_ASSIST = 0.26;
const MAX_DRIVE_SPEED = 15;
const MAX_REVERSE_SPEED = 13;

export class Race extends Phaser.Scene {
  private params!: RaceParams;
  private terrain!: TerrainData;

  private chassis!: Phaser.Physics.Matter.Image;
  private wheelA!: Phaser.Physics.Matter.Image; // rear
  private wheelB!: Phaser.Physics.Matter.Image; // front

  private state: 'countdown' | 'racing' | 'finished' | 'crashed' = 'countdown';
  private raceTime = 0;
  private recAcc = 0;
  private physAcc = 0;
  private frames: number[] = [];
  /** The completed run of this attempt, so ANY restart path (R key, ✕→retry) updates the ghosts. */
  private finishedRun: {
    ghost: { timeMs: number; fps: number; frames: number[] };
    res: FinishResponse | null;
  } | null = null;

  private throttle = false;
  private brake = false;
  private leanBack = false;
  private leanFwd = false;
  private lastGroundTime = 0;
  private prevVy = 0;

  private ghostRigs: GhostRig[] = [];
  private pads: { x: number; y: number; angle: number; lastFire: number }[] = [];

  private dustL!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dustR!: Phaser.GameObjects.Particles.ParticleEmitter;
  private boostFlame!: Phaser.GameObjects.Particles.ParticleEmitter;

  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private controls!: ControlLayout;

  constructor() {
    super('Race');
  }

  init(data: RaceParams): void {
    this.params = data;
    this.state = 'countdown';
    this.raceTime = 0;
    this.recAcc = 0;
    this.physAcc = 0;
    this.frames = [];
    this.finishedRun = null;
    this.ghostRigs = [];
    this.pads = [];
    this.throttle = false;
    this.brake = false;
  }

  create(): void {
    unlockAudio();
    const { track } = this.params;
    this.terrain = buildTerrain(track);

    // Fixed 60Hz physics stepping (see update()): identical feel and fair
    // ghosts on every display refresh rate (60/90/120Hz).
    this.matter.world.autoUpdate = false;

    // fullscreen backdrop in its own zoom-immune scene, behind this one
    if (!this.scene.isActive('Bg')) {
      this.scene.launch('Bg');
    }
    this.scene.sendToBack('Bg');
    this.cameras.main.transparent = true;

    // --- Terrain ---
    const gr = this.add.graphics().setDepth(-10);
    drawTerrain(gr, this.terrain);
    buildTerrainBodies(this, this.terrain);
    const padDefs = drawTrackDecor(this, track, this.terrain);
    this.pads = padDefs.map((p) => ({ ...p, lastFire: 0 }));

    // --- Buggy ---
    this.buildBuggy();

    // --- Ghosts: the podium (top-3 named replays) + your own PB ---
    const ghosts = this.params.ghosts;
    const medalTints = [PALETTE.ghostRecord, 0xdde4f2, 0xdb9a66];
    const medals = ['👑 ', '🥈 ', '🥉 '];
    ghosts?.top.slice(0, 3).forEach((g, i) => {
      this.addGhost(g, medalTints[i]!, medals[i]!);
    });
    if (ghosts?.mine) this.addGhost(ghosts.mine, PALETTE.ghostMine, '');

    // --- Particles ---
    this.dustL = this.add.particles(0, 0, 'dust', {
      speed: { min: 20, max: 70 },
      angle: { min: 200, max: 340 },
      scale: { start: 0.7, end: 0.1 },
      alpha: { start: 0.5, end: 0 },
      lifespan: 500,
      frequency: -1,
    });
    this.dustR = this.add.particles(0, 0, 'dust', {
      speed: { min: 20, max: 70 },
      angle: { min: 200, max: 340 },
      scale: { start: 0.7, end: 0.1 },
      alpha: { start: 0.5, end: 0 },
      lifespan: 500,
      frequency: -1,
    });
    this.boostFlame = this.add.particles(0, 0, 'glow', {
      speed: { min: 60, max: 160 },
      scale: { start: 0.9, end: 0 },
      alpha: { start: 0.9, end: 0 },
      lifespan: 400,
      frequency: -1,
      blendMode: Phaser.BlendModes.ADD,
    });

    // --- Camera ---
    const cam = this.cameras.main;
    cam.startFollow(this.chassis, false, 0.12, 0.1);
    cam.setFollowOffset(-this.scale.width * 0.14, this.scale.height * 0.06);

    // --- Input ---
    const kb = this.input.keyboard;
    if (kb) {
      this.cursors = kb.createCursorKeys();
      this.keyW = kb.addKey('W');
      this.keyA = kb.addKey('A');
      this.keyS = kb.addKey('S');
      this.keyD = kb.addKey('D');
      kb.on('keydown-R', () => this.uiRestart());
    }
    this.input.addPointer(2);

    // --- HUD overlay scene ---
    if (this.scene.isActive('Hud')) {
      this.hud()?.clearPanel();
    } else {
      this.scene.launch('Hud', { host: this });
    }

    // --- Countdown ---
    this.runCountdown();

    engineStart();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      engineStop();
      const kb2 = this.input.keyboard;
      kb2?.off('keydown-R');
    });
  }

  private hud(): Hud | null {
    return (this.scene.get('Hud') as Hud) ?? null;
  }

  // -------------------------------------------------------------------------
  // Hud host interface
  // -------------------------------------------------------------------------

  getHudInfo(): HudInfo {
    const timeText = formatMs(Math.floor(this.raceTime)).replace('s', '');
    let gap: HudInfo['gap'] = null;
    const rec = this.ghostRigs[0];
    if (rec && this.state === 'racing') {
      const dx = this.chassis.x - rec.sprite.x;
      const meters = Math.abs(Math.round(dx / 10));
      if (rec.finished && this.chassis.x < this.terrain.finishX) {
        gap = { text: '👻 ghost finished!', color: PALETTE.textBad };
      } else if (dx >= 0) {
        gap = { text: `▲ ${meters}m ahead`, color: PALETTE.textGood };
      } else {
        gap = { text: `▼ ${meters}m behind`, color: PALETTE.textBad };
      }
    }
    return { timeText, gap };
  }

  uiRestart(): void {
    this.restart();
  }

  uiExit(): void {
    this.exitRace();
  }

  // -------------------------------------------------------------------------
  // Setup helpers
  // -------------------------------------------------------------------------

  private buildBuggy(): void {
    const startY = terrainYAt(this.terrain.poly, START_X) - 80;

    // one negative collision group: chassis and wheels never collide with each other
    const group = this.matter.world.nextGroup(true);

    this.chassis = this.matter.add.image(START_X, startY, 'chassis', undefined, {
      shape: { type: 'rectangle', width: 100, height: 30 },
      chamfer: { radius: 8 },
      density: 0.002,
      friction: 0.25,
      restitution: 0.05,
      label: 'chassis',
      collisionFilter: { group },
    });
    this.chassis.setDepth(5);

    const wheelOpts = {
      shape: { type: 'circle', radius: 21 },
      density: 0.0018,
      friction: 1,
      frictionStatic: 1.2,
      restitution: 0.15,
      label: 'wheel',
      collisionFilter: { group },
    };
    this.wheelA = this.matter.add.image(START_X - 36, startY + 28, 'wheel', undefined, wheelOpts);
    this.wheelB = this.matter.add.image(START_X + 36, startY + 28, 'wheel', undefined, wheelOpts);
    this.wheelA.setDepth(6).setScale(44 / 48);
    this.wheelB.setDepth(6).setScale(44 / 48);

    const cBody = this.chassis.body as MatterJS.BodyType;
    const aBody = this.wheelA.body as MatterJS.BodyType;
    const bBody = this.wheelB.body as MatterJS.BodyType;

    const attach = (wheel: MatterJS.BodyType, ax: number): void => {
      const wx = ax > 0 ? 36 : -36;
      const anchors: [number, number][] = [
        [wx - 22, 8],
        [wx + 22, 8],
      ];
      for (const [px, py] of anchors) {
        const len = Math.hypot(wx - px, 28 - py);
        this.matter.add.constraint(cBody, wheel, len, 0.5, {
          pointA: { x: px, y: py },
          pointB: { x: 0, y: 0 },
          damping: 0.12,
        });
      }
    };
    attach(aBody, -1);
    attach(bBody, 1);

    // Ground-contact + impact tracking
    this.matter.world.on(
      'collisionactive',
      (event: Phaser.Physics.Matter.Events.CollisionActiveEvent) => {
        for (const pair of event.pairs) {
          const labels = [pair.bodyA.label, pair.bodyB.label];
          if (labels.includes('terrain') && labels.includes('wheel')) {
            this.lastGroundTime = this.time.now;
          }
        }
      }
    );
    this.matter.world.on(
      'collisionstart',
      (event: Phaser.Physics.Matter.Events.CollisionStartEvent) => {
        for (const pair of event.pairs) {
          const labels = [pair.bodyA.label, pair.bodyB.label];
          if (!labels.includes('terrain')) continue;
          const dyn = pair.bodyA.label === 'terrain' ? pair.bodyB : pair.bodyA;
          if (dyn.label !== 'wheel' && dyn.label !== 'chassis') continue;
          const impact = Math.abs(this.prevVy);
          if (impact > 7) {
            sfx.thud(Math.min(2, impact / 8));
            this.cameras.main.shake(120, 0.004 * Math.min(2.5, impact / 8));
          }
        }
      }
    );
  }

  private addGhost(ghost: Ghost, tint: number, prefix: string): void {
    if (!ghost.frames.length) return;
    const sprite = this.add
      .image(ghost.frames[0] ?? START_X, ghost.frames[1] ?? 0, 'ghostBuggyRaw')
      .setTint(tint)
      .setAlpha(0.42)
      .setDepth(3);
    const label = this.add
      .text(0, 0, `${prefix}u/${ghost.user}`, textStyle(13, '#ffffff', 3))
      .setOrigin(0.5, 1)
      .setAlpha(0.75)
      .setDepth(3);
    this.ghostRigs.push({ ghost, sprite, label, finished: false });
  }

  private runCountdown(): void {
    const steps = ['3', '2', '1', 'GO!'];
    steps.forEach((label, i) => {
      this.time.delayedCall(600 + i * 700, () => {
        if (label === 'GO!') {
          sfx.goBeep();
          this.state = 'racing';
        } else {
          sfx.countBeep();
        }
        this.hud()?.flashText(
          label,
          label === 'GO!' ? PALETTE.textGood : '#ffffff',
          label === 'GO!' ? 72 : 64
        );
      });
    });
  }

  // -------------------------------------------------------------------------
  // Update loop
  // -------------------------------------------------------------------------

  override update(_time: number, delta: number): void {
    if (!this.chassis?.body) return;
    const body = this.chassis.body as MatterJS.BodyType;

    // fixed-step physics: step at exactly 60Hz however fast the display runs
    const STEP = 1000 / 60;
    this.physAcc = Math.min(this.physAcc + delta, STEP * 4);
    while (this.physAcc >= STEP) {
      this.physAcc -= STEP;
      this.matter.world.step(STEP);
    }

    this.readInput();

    const grounded = this.time.now - this.lastGroundTime < 60;
    const speed = Math.hypot(body.velocity.x, body.velocity.y);

    if (this.state === 'racing') {
      this.raceTime += delta;
      this.drive(grounded, delta);
      this.record(delta);
      this.checkBoosts();
      this.checkCrash();
      this.checkFinish();
    } else if (this.state === 'finished') {
      // ease the car to a stop so it doesn't slam the end wall during slow-mo
      this.chassis.setVelocity(body.velocity.x * 0.93, body.velocity.y);
    }

    // engine audio: revs while racing, idles otherwise
    const rpm =
      this.state === 'racing'
        ? Phaser.Math.Clamp(speed / 32 + (this.throttle ? 0.15 : 0), 0, 1)
        : 0.08;
    engineUpdate(rpm, this.throttle && this.state === 'racing' ? 1 : 0.12);

    // ghosts
    this.updateGhosts();

    // dust
    this.updateDust(grounded, speed);

    // camera zoom by speed
    const cam = this.cameras.main;
    const w = this.scale.width;
    const h = this.scale.height;
    const base = Phaser.Math.Clamp(Math.min(h / 800, w / 1050), 0.48, 1.1);
    const target = base * (1 - Math.min(speed / 30, 1) * 0.15);
    cam.setZoom(Phaser.Math.Linear(cam.zoom, target, 0.04));

    this.prevVy = body.velocity.y;

    // feed the parallax backdrop
    this.registry.set('bgScroll', cam.scrollX);

    // fell out of the world
    if (this.state === 'racing' && this.chassis.y > 1500) this.crash();
  }

  private readInput(): void {
    let gas = false;
    let brk = false;
    let lb = false;
    let lf = false;

    if (this.cursors) {
      gas = this.cursors.right.isDown || this.keyD.isDown;
      brk = this.cursors.left.isDown || this.keyA.isDown;
      lf = this.cursors.up.isDown || this.keyW.isDown; // ↑ lean forward (nose down)
      lb = this.cursors.down.isDown || this.keyS.isDown; // ↓ lean back (nose up / backflip)
    }

    if (!this.controls) this.controls = controlLayout(this.scale.width, this.scale.height);
    const pointers = [this.input.pointer1, this.input.pointer2, this.input.activePointer];
    const seen = new Set<number>();
    for (const p of pointers) {
      if (!p?.isDown || seen.has(p.id)) continue;
      seen.add(p.id);
      if (inRect(this.controls.gas, p.x, p.y)) gas = true;
      else if (inRect(this.controls.brake, p.x, p.y)) brk = true;
      else if (inRect(this.controls.leanBack, p.x, p.y)) lb = true;
      else if (inRect(this.controls.leanFwd, p.x, p.y)) lf = true;
    }

    this.throttle = gas;
    this.brake = brk;
    this.leanBack = lb;
    this.leanFwd = lf;
  }

  private drive(grounded: boolean, delta: number): void {
    const dtf = delta / 16.666;
    const aBody = this.wheelA.body as MatterJS.BodyType;
    const bBody = this.wheelB.body as MatterJS.BodyType;
    const cBody = this.chassis.body as MatterJS.BodyType;

    // --- throttle & brake (wheels only bite when grounded) ---
    if (grounded) {
      const rot = this.chassis.rotation;
      const fwd = { x: Math.cos(rot), y: Math.sin(rot) };
      const vel = cBody.velocity;
      const alongFwd = vel.x * fwd.x + vel.y * fwd.y;

      if (this.throttle) {
        // rear-wheel drive: only the back wheel is powered
        this.wheelA.setAngularVelocity(Phaser.Math.Linear(aBody.angularVelocity, MAX_SPIN, 0.16 * dtf));
        // direct drive assist so hills are climbable
        if (alongFwd < MAX_DRIVE_SPEED) {
          this.chassis.setVelocity(vel.x + fwd.x * DRIVE_ASSIST * dtf, vel.y + fwd.y * DRIVE_ASSIST * dtf);
        }
        // weight transfer: the nose lifts under hard acceleration (nose up = ccw = negative)
        if (alongFwd < MAX_DRIVE_SPEED * 0.55 && !this.leanFwd) {
          this.chassis.setAngularVelocity(
            Phaser.Math.Clamp(cBody.angularVelocity - WHEELIE_TORQUE * dtf, -MAX_LEAN_AV, MAX_LEAN_AV)
          );
        }
      } else if (this.brake) {
        const forward = alongFwd > 1.5;
        const target = forward ? 0 : REVERSE_SPIN;
        // brakes act on both wheels; reverse drives only the rear
        this.wheelA.setAngularVelocity(Phaser.Math.Linear(aBody.angularVelocity, target, 0.24 * dtf));
        if (forward) {
          this.wheelB.setAngularVelocity(Phaser.Math.Linear(bBody.angularVelocity, 0, 0.24 * dtf));
        }
        if (forward) {
          this.chassis.setVelocity(vel.x * (1 - 0.07 * dtf), vel.y);
        } else if (alongFwd > -MAX_REVERSE_SPEED) {
          this.chassis.setVelocity(vel.x - fwd.x * REVERSE_ASSIST * dtf, vel.y - fwd.y * REVERSE_ASSIST * dtf);
        }
      }
    }

    // --- lean: independent control, motorcycle-style; stronger in the air ---
    const rate = grounded ? LEAN_GROUND : LEAN_AIR;
    if (this.leanBack !== this.leanFwd) {
      const dir = this.leanBack ? -1 : 1; // nose up (backflip) = counter-clockwise = negative
      this.chassis.setAngularVelocity(
        Phaser.Math.Clamp(cBody.angularVelocity + dir * rate * dtf, -MAX_LEAN_AV, MAX_LEAN_AV)
      );
    } else if (!grounded) {
      // light auto-stabilization: bleed spin so untouched flights level out slightly
      this.chassis.setAngularVelocity(cBody.angularVelocity * (1 - 0.008 * dtf));
    }
  }

  private record(delta: number): void {
    this.recAcc += delta;
    const step = 1000 / GHOST_FPS;
    while (this.recAcc >= step && this.frames.length < MAX_GHOST_NUMBERS - 3) {
      this.recAcc -= step;
      this.frames.push(
        Math.round(this.chassis.x * 10) / 10,
        Math.round(this.chassis.y * 10) / 10,
        Math.round(this.chassis.angle * 10) / 10
      );
    }
  }

  private updateGhosts(): void {
    const t = this.raceTime;
    for (const rig of this.ghostRigs) {
      const { ghost, sprite, label } = rig;
      const nFrames = ghost.frames.length / 3;
      const f = (t / 1000) * ghost.fps;
      const i0 = Math.min(Math.floor(f), nFrames - 1);
      const i1 = Math.min(i0 + 1, nFrames - 1);
      const frac = Phaser.Math.Clamp(f - i0, 0, 1);
      const x = Phaser.Math.Linear(ghost.frames[i0 * 3]!, ghost.frames[i1 * 3]!, frac);
      const y = Phaser.Math.Linear(ghost.frames[i0 * 3 + 1]!, ghost.frames[i1 * 3 + 1]!, frac);
      const a = Phaser.Math.Linear(ghost.frames[i0 * 3 + 2]!, ghost.frames[i1 * 3 + 2]!, frac);
      sprite.setPosition(x, y - 8);
      sprite.setAngle(a);
      label.setPosition(x, y - 48);
      if (!rig.finished && t >= ghost.timeMs) {
        rig.finished = true;
        label.setText(`${label.text} — ${formatMs(ghost.timeMs)}`);
        this.tweens.add({ targets: [sprite], alpha: 0.15, duration: 600 });
      }
    }
  }

  private updateDust(grounded: boolean, speed: number): void {
    if (grounded && speed > 6 && this.state === 'racing') {
      const count = speed > 20 ? 2 : 1;
      this.dustL.emitParticleAt(this.wheelA.x, this.wheelA.y + 14, count);
      if (this.throttle) this.dustR.emitParticleAt(this.wheelA.x - 10, this.wheelA.y + 12, 1);
    }
  }

  private checkBoosts(): void {
    const now = this.time.now;
    for (const pad of this.pads) {
      if (now - pad.lastFire < 900) continue;
      if (Math.abs(this.chassis.x - pad.x) < 48 && Math.abs(this.chassis.y - pad.y) < 80) {
        pad.lastFire = now;
        const body = this.chassis.body as MatterJS.BodyType;
        const rot = this.chassis.rotation;
        const dir = { x: Math.cos(rot), y: Math.sin(rot) };
        const sp = Math.hypot(body.velocity.x, body.velocity.y);
        const boostV = Math.min(sp + 7, 21);
        this.chassis.setVelocity(dir.x * boostV, dir.y * boostV);
        sfx.boost();
        this.boostFlame.emitParticleAt(this.chassis.x - dir.x * 40, this.chassis.y - dir.y * 40, 10);
        this.cameras.main.shake(90, 0.003);
      }
    }
  }

  private checkCrash(): void {
    // head point above the chassis, in world space
    const rot = this.chassis.rotation;
    const hx = this.chassis.x + Math.cos(rot) * 8 - Math.sin(rot) * -36;
    const hy = this.chassis.y + Math.sin(rot) * 8 + Math.cos(rot) * -36;
    const ground = terrainYAt(this.terrain.poly, hx);
    if (hy > ground + 4) this.crash();
  }

  private crash(): void {
    if (this.state !== 'racing') return;
    this.state = 'crashed';
    sfx.crash();
    this.cameras.main.shake(350, 0.012);
    this.cameras.main.flash(180, 255, 80, 40);
    this.dustL.emitParticleAt(this.chassis.x, this.chassis.y, 16);
    this.hud()?.flashText('WRECKED!', PALETTE.textBad, 52, 500);
    this.time.delayedCall(950, () => this.restart());
  }

  private checkFinish(): void {
    if (this.chassis.x >= this.terrain.finishX) this.finish();
  }

  // -------------------------------------------------------------------------
  // Finish flow
  // -------------------------------------------------------------------------

  private finish(): void {
    if (this.state !== 'racing') return;
    this.state = 'finished';
    const timeMs = Math.floor(this.raceTime);
    sfx.finish();

    // slow-mo + confetti
    this.matter.world.engine.timing.timeScale = 0.35;
    this.time.delayedCall(900, () => {
      this.matter.world.engine.timing.timeScale = 1;
    });
    const fy = terrainYAt(this.terrain.poly, this.terrain.finishX);
    const confetti = this.add.particles(this.terrain.finishX, fy - 120, 'confetti', {
      speed: { min: 120, max: 320 },
      angle: { min: 230, max: 310 },
      gravityY: 500,
      rotate: { start: 0, end: 720 },
      scale: { min: 0.6, max: 1.2 },
      lifespan: 1600,
      quantity: 40,
      tint: [0xffd166, 0x66e0ff, 0x6fc24b, 0xe8543f, 0xffffff],
      emitting: false,
    });
    confetti.explode(46);

    const ghost = { timeMs, fps: GHOST_FPS, frames: this.frames };

    if (this.params.arena === 'test') {
      this.time.delayedCall(700, () => this.showTestResults(timeMs, ghost));
      return;
    }

    this.finishedRun = { ghost, res: null };
    void (async () => {
      let res: FinishResponse | null = null;
      let submitError: string | null = null;
      try {
        res = await submitFinish({ arena: this.params.arena as 'post' | 'daily', timeMs, ghost });
      } catch (e) {
        submitError = e instanceof Error ? e.message : 'Could not save your time';
        console.error('finish submit failed', e);
      }
      if (this.finishedRun?.ghost === ghost) this.finishedRun = { ghost, res };
      this.time.delayedCall(400, () => this.showResults(timeMs, res, submitError));
    })();
  }

  private showResults(timeMs: number, res: FinishResponse | null, submitError: string | null = null): void {
    const username = this.params.init.username;

    const title = res?.tookRecord ? '👑 TRACK RECORD!' : res?.newPB ? '⚡ NEW PERSONAL BEST!' : '🏁 FINISH!';
    const titleColor = res?.tookRecord ? PALETTE.textAccent : res?.newPB ? PALETTE.textGood : '#ffffff';
    if (res?.tookRecord) sfx.record();
    else if (res?.newPB) sfx.pb();

    const lines: { text: string; color: string }[] = [];
    if (res) {
      if (res.tookRecord && res.dethroned) {
        lines.push({ text: `you dethroned u/${res.dethroned} 😈`, color: PALETTE.textAccent });
      } else if (!res.tookRecord) {
        lines.push({ text: `record: ${formatMs(res.recordMs)}`, color: PALETTE.textDim });
      }
      if (res.rpEarned > 0) {
        const mult = res.multiplier > 1 ? `  (×${res.multiplier.toFixed(1)} streak 🔥)` : '';
        lines.push({ text: `+${res.rpEarned} RP${mult}`, color: PALETTE.textGood });
      }
      if (res.practice) lines.push({ text: 'your own track — practice pay only', color: PALETTE.textDim });
    } else if (!username) {
      lines.push({ text: 'log in to save times & earn RP', color: PALETTE.textDim });
    } else if (submitError) {
      lines.push({ text: `⚠ time not saved: ${submitError}`, color: PALETTE.textBad });
    }

    const spec: PanelSpec = {
      title,
      titleColor,
      big: formatMs(timeMs),
      lines,
      buttons: [
        {
          label: '↻  RETRY',
          onClick: () => this.restart(),
        },
        { label: '🎲  RACE ANOTHER TRACK', onClick: () => void this.gotoNext() },
        { label: '🏠  MENU', style: 'dim', onClick: () => this.exitToMenu() },
      ],
    };
    this.hud()?.showPanel(spec);
  }

  private showTestResults(timeMs: number, ghost: { timeMs: number; fps: number; frames: number[] }): void {
    const spec: PanelSpec = {
      title: '✅ TEST RUN COMPLETE',
      titleColor: PALETTE.textGood,
      big: formatMs(timeMs),
      lines: [{ text: 'this run becomes the record to beat', color: PALETTE.textDim }],
      buttons: [
        {
          label: '✓  USE THIS RUN',
          onClick: () => {
            this.stopHud();
            this.scene.start('Editor', {
              init: this.params.init,
              editorState: this.params.editorState,
              testResult: { timeMs, ghost },
            });
          },
        },
        { label: '↻  TRY AGAIN', onClick: () => this.restart() },
        {
          label: '←  BACK TO EDITOR',
          style: 'dim',
          onClick: () => {
            this.stopHud();
            this.scene.start('Editor', { init: this.params.init, editorState: this.params.editorState });
          },
        },
      ],
    };
    this.hud()?.showPanel(spec);
  }

  /** After a PB, race your fresh ghost on retry (and reseat the podium locally). */
  private applyNewGhost(ghost: { timeMs: number; fps: number; frames: number[] }, res: FinishResponse | null): void {
    if (!res?.newPB) return;
    const user = this.params.init.username ?? 'you';
    const g: Ghost = { user, ...ghost };
    const cur: GhostsResponse = this.params.ghosts ?? { top: [], mine: null };
    const sorted = [...cur.top.filter((t) => t.user !== user), g].sort((a, b) => a.timeMs - b.timeMs);
    const idx = sorted.indexOf(g);
    if (idx < 3) {
      cur.top = sorted.slice(0, 3);
      cur.mine = null;
    } else {
      cur.top = sorted.filter((t) => t !== g).slice(0, 3);
      cur.mine = g;
    }
    this.params.ghosts = cur;
  }

  private async gotoNext(): Promise<void> {
    try {
      const next = await fetchNextTrack();
      if (next.url) {
        navigateTo(next.url);
        return;
      }
    } catch {
      /* fallthrough */
    }
    const hud = this.hud();
    if (hud) toast(hud, 'No other tracks yet — build one! 🛠', PALETTE.textAccent);
  }

  private stopHud(): void {
    this.scene.stop('Hud');
    this.scene.stop('Bg');
  }

  private restart(): void {
    this.consumeFinishedRun();
    engineStop();
    this.matter.world.engine.timing.timeScale = 1;
    this.hud()?.clearPanel();
    this.scene.restart(this.params);
  }

  /** Fold the just-finished run into the ghost lineup, however the restart was triggered. */
  private consumeFinishedRun(): void {
    const run = this.finishedRun;
    this.finishedRun = null;
    if (!run) return;
    let res = run.res;
    if (!res) {
      // Server hasn't answered yet (e.g. R pressed instantly) — judge the run
      // locally; the server remains the source of truth on the next full load.
      const user = this.params.init.username ?? 'you';
      const ghosts = this.params.ghosts;
      const myPrev =
        ghosts?.mine?.user === user
          ? ghosts.mine.timeMs
          : (ghosts?.top.find((t) => t.user === user)?.timeMs ?? null);
      const newPB = myPrev === null || run.ghost.timeMs < myPrev;
      const best = ghosts?.top[0]?.timeMs ?? null;
      const tookRecord = newPB && (best === null || run.ghost.timeMs < best);
      res = {
        rpEarned: 0,
        newPB,
        tookRecord,
        dethroned: null,
        recordMs: tookRecord ? run.ghost.timeMs : (best ?? run.ghost.timeMs),
        streak: 0,
        multiplier: 1,
        practice: false,
      };
    }
    this.applyNewGhost(run.ghost, res);
  }

  private exitToMenu(): void {
    engineStop();
    this.matter.world.engine.timing.timeScale = 1;
    this.stopHud();
    this.scene.start('Menu');
  }

  private exitRace(): void {
    if (this.params.arena === 'test') {
      engineStop();
      this.matter.world.engine.timing.timeScale = 1;
      this.stopHud();
      this.scene.start('Editor', { init: this.params.init, editorState: this.params.editorState });
    } else {
      this.exitToMenu();
    }
  }
}
