import Engine from './engine.js';

export default class Classic extends Engine {
  constructor(canvas) {
    super(canvas);

    // Spawn one snake with target length 3 at a random spot. While idle the
    // snake is just a single visible cell; once the player picks a
    // direction it grows to its full length as it moves -- always rendering
    // as a straight line because every step extends in the same direction.
    const head = {
      x: Math.floor(Math.random() * this.cols),
      y: Math.floor(Math.random() * this.rows),
    };
    this._snake = this.addSnake({ head, length: 3 });
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

  onEat(snake, food) {
    super.onEat(snake, food);
    this.addRandomFood();
  }
}
