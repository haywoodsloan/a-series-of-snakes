import Engine, { STARTING_LENGTH } from './engine.js';

// Flip table: up<->down, left<->right. Applied at the input source so the
// engine's U-turn guard never sees the pre-flip direction.
const FLIP = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

/**
 * Inverted controls: every direction input is flipped 180 degrees before
 * being handed to the snake. Plays like classic, with your brain on backwards.
 */
export default class Inverted extends Engine {
  constructor(canvas) {
    super(canvas);

    this._snake = this.addSnakeAtRandomCell({ length: STARTING_LENGTH });
    this._started = false;

    this.addRandomFood();

    this.onInput(({ dir }) => {
      this.setDirection(this._snake, FLIP[dir]);
      this._started = true;
    });
  }

  update() {
    if (!this._started || this.gameOver) return;
    this.stepAll();
  }
}
