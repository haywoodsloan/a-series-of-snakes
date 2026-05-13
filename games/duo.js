import { SNAKE_ALT } from '../utils/colors.js';
import Engine from './engine.js';

// Speed ramp tuning, mirrored from classic.js.
const BASE_TICK_RATE = 8;
const SPEED_STEP = 0.4;
const MAX_TICK_RATE = 20;

export default class Duo extends Engine {
  constructor(canvas) {
    super(canvas, { tickRate: BASE_TICK_RATE });

    // Place each snake at a random empty cell. The second call sees the
    // first snake's segment as occupied, so the two starting positions can
    // never collide. Initial direction is randomized per snake -- snakes
    // stay put until the first input arrives, but once *either* player
    // presses a key both snakes start moving, so each needs a sensible
    // default heading.
    const DIRECTIONS = ['up', 'down', 'left', 'right'];
    const randDir = () =>
      DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];

    // WASD controls the primary (foreground) snake; arrows control the
    // alt-tinted snake so the on-screen color matches the typical "blue =
    // second player" convention from the other multi-snake games.
    this._snakeWasd = this.addSnake({
      head: this.randomEmptyCell(),
      length: 3,
      direction: randDir(),
    });
    this._snakeArrows = this.addSnake({
      head: this.randomEmptyCell(),
      length: 3,
      direction: randDir(),
      color: SNAKE_ALT,
    });
    // Each snake waits for its *own* player's first input before it starts
    // moving. A snake that hasn't received input is still on the board and
    // is still collidable -- the other (already moving) snake can run into
    // it -- but it doesn't step forward on its own.
    this._startedWasd = false;
    this._startedArrows = false;

    // One pellet to start. Either snake can claim it; both grow on a pickup.
    this.addRandomFood();

    // Route input by `kind` so each player drives only their own snake,
    // and flag that snake as started so it begins moving on the next tick.
    this.onInput(({ kind, dir }) => {
      if (kind === 'wasd') {
        this.setDirection(this._snakeWasd, dir);
        this._startedWasd = true;
      } else if (kind === 'arrows') {
        this.setDirection(this._snakeArrows, dir);
        this._startedArrows = true;
      }
    });
  }

  update() {
    if (this.gameOver) return;
    // Temporarily hide any not-yet-started snake from `stepAll` so it
    // doesn't advance. It stays in `this.snakes` afterward, so the other
    // snake still collides with it and rendering still draws it.
    const skipped = [];
    if (!this._startedWasd) skipped.push(this._snakeWasd);
    if (!this._startedArrows) skipped.push(this._snakeArrows);
    if (skipped.length === this.snakes.length) return;

    this.snakes = this.snakes.filter((s) => !skipped.includes(s));
    try {
      this.stepAll();
    } finally {
      this.snakes.push(...skipped);
    }
  }

  // Either snake eating grows BOTH snakes (mirror-style shared growth),
  // but the pickup only counts once toward the score.
  onEat(snake, food) {
    super.onEat(snake, food);
    const other =
      snake === this._snakeWasd ? this._snakeArrows : this._snakeWasd;
    other.length += 1;
    this.addRandomFood();
    this.setTickRate(
      Math.min(MAX_TICK_RATE, BASE_TICK_RATE + this.score * SPEED_STEP)
    );
  }
}
