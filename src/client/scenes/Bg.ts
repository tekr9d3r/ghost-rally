import * as Phaser from 'phaser';

/**
 * Fullscreen parallax backdrop rendered in its own scene BELOW the race,
 * with a static camera — immune to the race camera's scroll and zoom.
 * The race publishes its camera scroll via registry key 'bgScroll'.
 */
export class Bg extends Phaser.Scene {
  private sky!: Phaser.GameObjects.Image;
  private sun!: Phaser.GameObjects.Image;
  private sunCore!: Phaser.GameObjects.Arc;
  private hillFar!: Phaser.GameObjects.TileSprite;
  private hillNear!: Phaser.GameObjects.TileSprite;

  constructor() {
    super('Bg');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    this.sky = this.add.image(0, 0, 'sky').setOrigin(0);
    this.sky.setDisplaySize(w, h);

    this.sun = this.add.image(w * 0.78, h * 0.26, 'glow').setScale(5).setAlpha(0.9);
    this.sunCore = this.add.circle(w * 0.78, h * 0.26, 36, 0xffd98a).setAlpha(0.95);

    for (let i = 0; i < 4; i++) {
      const c = this.add
        .image(Math.random() * w, h * (0.08 + Math.random() * 0.24), 'cloud')
        .setAlpha(0.16 + Math.random() * 0.14)
        .setScale(0.8 + Math.random() * 1.1);
      this.tweens.add({
        targets: c,
        x: c.x + 50 + Math.random() * 80,
        duration: 30000 + Math.random() * 30000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }

    this.hillFar = this.add.tileSprite(0, h - 150, w, 260, 'hillFar').setOrigin(0, 0.35).setAlpha(0.95);
    this.hillNear = this.add.tileSprite(0, h - 70, w, 220, 'hillNear').setOrigin(0, 0.35);

    this.scale.on('resize', (gs: Phaser.Structs.Size) => {
      this.sky.setDisplaySize(gs.width, gs.height);
      this.sun.setPosition(gs.width * 0.78, gs.height * 0.26);
      this.sunCore.setPosition(gs.width * 0.78, gs.height * 0.26);
      this.hillFar.setPosition(0, gs.height - 150).setSize(gs.width, 260);
      this.hillNear.setPosition(0, gs.height - 70).setSize(gs.width, 220);
    });
  }

  override update(): void {
    const scroll = (this.registry.get('bgScroll') as number) ?? 0;
    this.hillFar.tilePositionX = scroll * 0.12;
    this.hillNear.tilePositionX = scroll * 0.28;
  }
}
