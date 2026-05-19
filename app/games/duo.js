import { SNAKE_ALT } from '../utils/colors.js';
import Engine, { STARTING_LENGTH } from './engine.js';

const DIRECTIONS = ['up', 'down', 'left', 'right'];
const randDir = () => DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];

/**
 * Duo: two snakes share one board. WASD drives the primary snake; arrows
 * drive the alt-tinted snake. Either snake eating grows both, and crashing
 * into the other snake (idle or moving) ends the run.
 */
export default class Duo extends Engine {
  constructor(canvas) {
    super(canvas);

    // Place each snake at a random empty cell. The second call sees the
    // first snake's segment as occupied, so the two starting positions
    // can never collide. Initial direction is randomized per snake -- a
    // snake stays put until its own player presses a key, but once it
    // starts moving it needs a sensible default heading.
    //
    // WASD drives the primary (foreground) snake; arrows drive the
    // alt-tinted snake so the on-screen color matches the typical
    // "blue = second player" convention from the other multi-snake games.
    this._snakeWasd = this.addSnakeAtRandomCell({
      length: STARTING_LENGTH,
      direction: randDir(),
    });
    this._snakeArrows = this.addSnakeAtRandomCell({
      length: STARTING_LENGTH,
      direction: randDir(),
      color: SNAKE_ALT,
    });

    // Each snake is gated on its own player's first input. A gated snake
    // stays on the board and is fully collidable -- the other (moving)
    // snake will die if it runs into it -- but it doesn't step forward
    // on its own.
    this._startedWasd = false;
    this._startedArrows = false;

    // One pellet to start. Either snake can claim it; both grow on a pickup.
    this.addRandomFood();

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

    // Fast path: once both players are in, the per-snake gate is no longer
    // needed and we can defer to the engine's built-in step loop.
    if (this._startedWasd && this._startedArrows) {
      this.stepAll();
      return;
    }
    // Neither player has moved yet -- nothing to step.
    if (!this._startedWasd && !this._startedArrows) return;

    // Mixed state: exactly one snake is moving. Inline a step loop that
    // skips the gated snake but still uses `_detectCollision`, which walks
    // the full `this.snakes` array -- so the stationary snake remains a
    // valid collision target ("you can run into your idle friend").
    const active = this._startedWasd ? this._snakeWasd : this._snakeArrows;
    if (active.dead) return;

    const at = this.stepSnake(active);

    const foodIdx = this.food.findIndex((p) => p.x === at.x && p.y === at.y);
    if (foodIdx !== -1) {
      const eaten = this.food[foodIdx];
      this.food.splice(foodIdx, 1);
      this.onEat(active, eaten);
    }

    const hit = this._detectCollision(active, at);
    if (hit) this.onCollision(hit);
  }

  // Either snake eating grows BOTH snakes (mirror-style shared growth),
  // but the pickup only counts once toward the score. `super.onEat`
  // handles the eater's growth, score bump, food respawn, and speed ramp.
  onEat(snake, food) {
    super.onEat(snake, food);
    const other =
      snake === this._snakeWasd ? this._snakeArrows : this._snakeWasd;
    other.length += 1;
  }
}
