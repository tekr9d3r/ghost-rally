import * as Phaser from 'phaser';

/** Parallax twilight backdrop shared by all scenes. */
export const addBackground = (scene: Phaser.Scene): void => {
  const w = scene.scale.width;
  const h = scene.scale.height;

  const sky = scene.add.image(0, 0, 'sky').setOrigin(0).setScrollFactor(0).setDepth(-100);
  sky.setDisplaySize(w, h);

  const sun = scene.add
    .image(w * 0.78, h * 0.3, 'glow')
    .setScale(4.5)
    .setScrollFactor(0)
    .setDepth(-95)
    .setAlpha(0.9);
  const sunCore = scene.add
    .circle(w * 0.78, h * 0.3, 34, 0xffd98a)
    .setScrollFactor(0)
    .setDepth(-94)
    .setAlpha(0.95);

  for (let i = 0; i < 4; i++) {
    const c = scene.add
      .image(Math.random() * w, h * (0.08 + Math.random() * 0.22), 'cloud')
      .setScrollFactor(0.06 * (i % 2 === 0 ? 1 : 1.6), 0)
      .setDepth(-93)
      .setAlpha(0.18 + Math.random() * 0.15)
      .setScale(0.7 + Math.random() * 0.9);
    scene.tweens.add({
      targets: c,
      x: c.x + 40 + Math.random() * 60,
      duration: 30000 + Math.random() * 30000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  scene.add
    .tileSprite(0, h - 170, w, 260, 'hillFar')
    .setOrigin(0, 0.35)
    .setScrollFactor(0.15, 0.02)
    .setDepth(-92)
    .setAlpha(0.95);
  scene.add
    .tileSprite(0, h - 90, w, 220, 'hillNear')
    .setOrigin(0, 0.35)
    .setScrollFactor(0.35, 0.04)
    .setDepth(-91);

  // keep references so resize can adjust; cleaned up on scene shutdown
  const onResize = (gs: Phaser.Structs.Size): void => {
    sky.setDisplaySize(gs.width, gs.height);
    sun.setPosition(gs.width * 0.78, gs.height * 0.3);
    sunCore.setPosition(gs.width * 0.78, gs.height * 0.3);
  };
  scene.scale.on('resize', onResize);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off('resize', onResize));
};
