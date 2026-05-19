import Engine, { STARTING_LENGTH } from './engine.js';

/**
 * Classic snake: one snake on a wrapping grid, one pellet at a time,
 * eat to grow and ramp speed. The baseline mode against which every
 * other variant defines its twist.
 */
export default class Classic extends Engine {
  constructor(canvas) {
    super(canvas);

    // Spawn one snake with target length 3 at a random spot. While idle the
    // snake is just a single visible cell; once the player picks a
    // direction it grows to its full length as it moves -- always rendering
    // as a straight line because every step extends in the same direction.
    this._snake = this.addSnakeAtRandomCell({ length: STARTING_LENGTH });
    this._started = false;

    // One pellet to start.
    this.addRandomFood();

    // First direction input also starts the snake moving.
    this.onInput(({ dir }) => {
      this.setDirection(this._snake, dir);
      this._started = true;
    });
  }

  update() {
    if (!this._started || this.gameOver) return;
    this.stepAll();
  }
}
