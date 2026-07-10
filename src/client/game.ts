import * as Phaser from 'phaser';
import { Boot } from './scenes/Boot';
import { Menu } from './scenes/Menu';
import { Race } from './scenes/Race';
import { Editor } from './scenes/Editor';
import { Hud } from './scenes/Hud';
import { Bg } from './scenes/Bg';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#12233a',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 0.72 },
      positionIterations: 8,
      velocityIterations: 6,
    },
  },
  input: {
    activePointers: 3,
  },
  scene: [Boot, Menu, Race, Editor, Hud, Bg],
};

/** Global game handle — used by DOM overlays to pause keyboard capture. */
export let gameRef: Phaser.Game | null = null;

document.addEventListener('DOMContentLoaded', () => {
  gameRef = new Phaser.Game(config);
});
