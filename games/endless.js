import Engine from './engine.js';

// Endless mode runs a hair faster than classic's starting tick rate and
// never ramps up -- the difficulty curve comes entirely from the
// ever-growing tail, so the timing stays constant and predictable.
const TICK_RATE = 10;

// Snake starts as a single visible cell. There's no food in this mode --
// the trail grows by one segment per tick once the player starts moving.
// Local override (not the shared engine `STARTING_LENGTH`) because the
// trail-only design relies on the snake being a single cell at spawn.
const ENDLESS_STARTING_LENGTH = 1;

/**
 * Endless: no food, no speed ramp -- the snake grows by one cell every
 * tick and the score is just how long the trail gets before you cross it.
 */
export default class Endless extends Engine {
  constructor(canvas) {
    super(canvas, { tickRate: TICK_RATE });

    // Single snake at a random cell. The snake stays a single visible cell
    // while idle; once the player picks a direction it starts moving and
    // grows by one segment every tick -- there is no food in this mode,
    // the "score" is just how long the trail gets before you cross it.
    this._snake = this.addSnakeAtRandomCell({ length: ENDLESS_STARTING_LENGTH });
    this._started = false;

    this.onInput(({ dir }) => {
      this.setDirection(this._snake, dir);
      this._started = true;
    });
  }

  update() {
    if (!this._started || this.gameOver) return;
    // Bump the target length BEFORE stepping so the new head segment is
    // kept (the tail-trim step in `stepSnake` only pops when segments >
    // length). The score mirrors the body length so the HUD reads as the
    // size of the trail the player has drawn.
    this._snake.length += 1;
    this.score += 1;
    this.stepAll();
  }
}
