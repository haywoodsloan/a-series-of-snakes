import Engine from './engine.js';

// Spikes plays exactly like classic, but the playfield is seeded with
// random spike walls that kill the snake on contact.

// Fraction of the grid filled with spike walls at game start.
const WALL_RATIO = 0.1;

// Cells of clearance kept around the snake's starting segments so the
// initial spawn isn't an instant death trap. >= 2 satisfies the design
// requirement that the snake never spawns within 2 squares of a wall.
const SPAWN_CLEARANCE = 2;

export default class Spikes extends Engine {
  constructor(canvas) {
    super(canvas);

    const head = {
      x: Math.floor(Math.random() * this.cols),
      y: Math.floor(Math.random() * this.rows),
    };
    this._snake = this.addSnake({ head, length: 3 });
    this._started = false;

    // Place walls before food: addRandomWalls reserves a buffer around the
    // snake, and addRandomFood already avoids wall cells via
    // randomEmptyCell, so spawning food afterward is safe.
    this.addRandomWalls({ ratio: WALL_RATIO, clearance: SPAWN_CLEARANCE });
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
