import Engine, { STARTING_LENGTH } from './engine.js';

// Spikes plays exactly like classic, but the playfield is seeded with
// random spike walls that kill the snake on contact.

// Fraction of the grid filled with spike walls at game start.
const WALL_RATIO = 0.1;

/**
 * Spikes: classic rules on a board pre-seeded with clustered spike walls.
 * Touching a wall ends the run just like hitting yourself.
 */
export default class Spikes extends Engine {
  constructor(canvas) {
    super(canvas);

    this._snake = this.addSnakeAtRandomCell({ length: STARTING_LENGTH });
    this._started = false;

    // Place walls before food: addRandomWalls reserves a buffer around the
    // snake, and addRandomFood already avoids wall cells via
    // randomEmptyCell, so spawning food afterward is safe.
    this.addRandomWalls({ ratio: WALL_RATIO });
    this.addRandomFood();

    this.onInput(({ dir }) => {
      this.setDirection(this._snake, dir);
      this._started = true;
    });
  }

  update() {
    if (!this._started || this.gameOver) return;
    this.stepAll();
  }

  onCollision(collision) {
    // Default Engine behavior already ends the game on any collision,
    // including the new 'wall' type. The explicit override exists so the
    // wall case is visible in this file -- and so future tweaks (e.g. a
    // chip-of-armor mechanic) have an obvious place to land.
    super.onCollision(collision);
  }
}
