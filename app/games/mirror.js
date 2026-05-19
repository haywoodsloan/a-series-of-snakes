import { SNAKE_ALT } from '../utils/colors.js';
import Engine, { STARTING_LENGTH } from './engine.js';

// Mirror needs an even column count so every cell has a distinct mirror
// cell across the vertical center line -- with the engine's default
// (odd) grid the center column would map to itself and break the
// "snakes never share a cell" invariant.
const COLS = 24;

// Horizontal mirror for direction inputs. Vertical motion is unchanged so
// both snakes always occupy the same row; horizontal motion is flipped so
// they always sit at mirrored columns across the vertical center line.
const MIRROR_DIR = {
  up: 'up',
  down: 'down',
  left: 'right',
  right: 'left',
};

/**
 * Mirror: two snakes that always move in mirrored directions across the
 * vertical center line. One set of inputs drives both; either eating
 * grows both. Forces an even column count so the reflection is exact.
 */
export default class Mirror extends Engine {
  constructor(canvas) {
    // Force an even number of columns so every cell has a distinct mirror
    // cell across the vertical center line -- see `COLS` above for why.
    super(canvas, { cols: COLS });

    // Place the primary snake on the left half so its mirror lands on the
    // right half without overlap. The mirror is offset by exactly half the
    // grid height (with wrap) so the two snakes are always as far apart on
    // the y-axis as the board allows -- no immediate same-row collisions.
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
    this._snakeA = this.addSnake({
      head,
      length: STARTING_LENGTH,
    });
    this._snakeB = this.addSnake({
      head: mirrorHead,
      length: STARTING_LENGTH,
      direction: 'left',
      color: SNAKE_ALT,
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
  // score. `super.onEat` handles the eating snake's growth, score bump,
  // food respawn, and speed ramp; we mirror the growth onto the partner.
  onEat(snake, food) {
    super.onEat(snake, food);
    const other = snake === this._snakeA ? this._snakeB : this._snakeA;
    other.length += 1;
  }
}
