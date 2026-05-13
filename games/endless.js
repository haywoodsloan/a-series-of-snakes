import Engine from './engine.js';

// Endless mode runs a hair faster than classic's starting tick rate and
// never ramps up -- the difficulty curve comes entirely from the
// ever-growing tail, so the timing stays constant and predictable.
const TICK_RATE = 10;

export default class Endless extends Engine {
  constructor(canvas) {
    super(canvas, { tickRate: TICK_RATE });

    // Single snake at a random cell. The snake stays a single visible cell
    // while idle; once the player picks a direction it starts moving and
    // grows by one segment every tick -- there is no food in this mode,
    // the "score" is just how long the trail gets before you cross it.
    const head = {
      x: Math.floor(Math.random() * this.cols),
      y: Math.floor(Math.random() * this.rows),
    };
    this._snake = this.addSnake({ head, length: 1 });
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
