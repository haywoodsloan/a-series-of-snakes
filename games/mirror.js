import Engine from './engine.js';

// Speed ramp tuning, mirrored from classic.js.
const BASE_TICK_RATE = 8;
const SPEED_STEP = 0.4;
const MAX_TICK_RATE = 20;

// Horizontal mirror for direction inputs. Vertical motion is unchanged so
// both snakes always occupy the same row; horizontal motion is flipped so
// they always sit at mirrored columns across the vertical center line.
const MIRROR_DIR = {
  up: 'up',
  down: 'down',
  left: 'right',
  right: 'left',
};

export default class Mirror extends Engine {
  constructor(canvas) {
    super(canvas, { tickRate: BASE_TICK_RATE });

    // Place the primary snake on the left half so its mirror lands on the
    // right half without overlap. With cols=20 (even) every cell has a
    // distinct mirror cell. The mirror is offset by exactly half the grid
    // height (with wrap) so the two snakes are always as far apart on the
    // y-axis as the board allows -- no immediate same-row collisions.
    const half = Math.floor(this.cols / 2);
    const head = {
      x: Math.floor(Math.random() * half),
      y: Math.floor(Math.random() * this.rows),
    };
    const mirrorHead = {
      x: this.cols - 1 - head.x,
      y: (head.y + Math.floor(this.rows / 2)) % this.rows,
    };

    // Primary moves right by default; mirror moves left (its reflection).
    // Tint the mirror snake light blue so the two are visually distinct.
    this._snakeA = this.addSnake({ head, length: 3, direction: 'right' });
    this._snakeB = this.addSnake({
      head: mirrorHead,
      length: 3,
      direction: 'left',
      color: '#6bd4ff',
    });
    this._started = false;

    // One pellet to start. Either snake can claim it; both grow on a pickup.
    this.addRandomFood();

    this.onInput(({ dir }) => {
      this.setDirection(this._snakeA, dir);
      this.setDirection(this._snakeB, MIRROR_DIR[dir]);
      this._started = true;
    });
  }

  update() {
    if (!this._started || this.gameOver) return;
    this.stepAll();
  }

  // Either snake eating grows BOTH snakes, but only counts once toward the
  // score. The default `onEat` handles `snake.length++` and `score++`; we
  // mirror the growth onto the other snake here.
  onEat(snake, food) {
    super.onEat(snake, food);
    const other = snake === this._snakeA ? this._snakeB : this._snakeA;
    other.length += 1;
    this.addRandomFood();
    this.setTickRate(
      Math.min(MAX_TICK_RATE, BASE_TICK_RATE + this.score * SPEED_STEP)
    );
  }
}
