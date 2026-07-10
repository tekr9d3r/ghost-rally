import * as Phaser from 'phaser';
import { generateAllTextures, PALETTE } from '../textures';
import { textStyle } from '../ui';
import { fetchInit } from '../net';
import type { InitResponse } from '../../shared/types';

export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    generateAllTextures(this);

    const w = this.scale.width;
    const h = this.scale.height;
    this.cameras.main.setBackgroundColor(0x12233a);
    const loading = this.add
      .text(w / 2, h / 2, 'Starting engines…', textStyle(20, PALETTE.textDim))
      .setOrigin(0.5);
    this.tweens.add({ targets: loading, alpha: 0.4, duration: 500, yoyo: true, repeat: -1 });

    void (async () => {
      try {
        const init: InitResponse = await fetchInit();
        this.registry.set('init', init);
        this.scene.start('Menu');
      } catch (e) {
        console.error('init failed:', e);
        loading.setText('Could not reach the pit crew.\nTap to retry.');
        this.tweens.killTweensOf(loading);
        loading.setAlpha(1);
        this.input.once('pointerdown', () => this.scene.restart());
      }
    })();
  }
}
