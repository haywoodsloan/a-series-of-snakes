import Engine from './engine.js';

// Speed ramp tuning, mirrored from classic.js.
const BASE_TICK_RATE = 8;
const SPEED_STEP = 0.4;
const MAX_TICK_RATE = 20;

// Flip table: up<->down, left<->right. Applied at the input source so the
// engine's U-turn guard never sees the pre-flip direction.
const FLIP = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export default class Inverted extends Engine {
  constructor(canvas) {
    super(canvas, { tickRate: BASE_TICK_RATE });

    const head = {
      x: Math.floor(Math.random() * this.cols),
      y: Math.floor(Math.random() * this.rows),
    };
    this._snake = this.addSnake({ head, length: 3 });
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

  onEat(snake, food) {
    super.onEat(snake, food);
    this.addRandomFood();
    this.setTickRate(
      Math.min(MAX_TICK_RATE, BASE_TICK_RATE + this.score * SPEED_STEP)
    );
  }
}
