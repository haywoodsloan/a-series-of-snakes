import Engine from './engine.js';

// Speed ramp tuning, mirrored from classic.js.
const BASE_TICK_RATE = 8;
const SPEED_STEP = 0.4;
const MAX_TICK_RATE = 20;

// Food moves at this fraction of the snake's tick rate, on its own timer
// so its cadence is independent of the simulation tick. Decoupling avoids
// the stutter that comes from quantizing food motion to snake ticks.
const FOOD_SPEED = 0.35;

export default class Chase extends Engine {
  constructor(canvas) {
    super(canvas, { tickRate: BASE_TICK_RATE });

    const head = {
      x: Math.floor(Math.random() * this.cols),
      y: Math.floor(Math.random() * this.rows),
    };
    this._snake = this.addSnake({ head, length: 3 });
    this._started = false;
    this._foodTimer = 0;

    this.addRandomFood();

    this.onInput(({ dir }) => {
      this.setDirection(this._snake, dir);
      if (!this._started) {
        this._started = true;
        this._scheduleFoodTimer();
      }
    });
  }

  update() {
    if (!this._started || this.gameOver) return;
    this.stepAll();
  }

  onEat(snake, food) {
    super.onEat(snake, food);
    this.addRandomFood();
    this.setTickRate(
      Math.min(MAX_TICK_RATE, BASE_TICK_RATE + this.score * SPEED_STEP)
    );
  }

  // Override so the food timer tracks the new snake speed.
  setTickRate(rate) {
    super.setTickRate(rate);
    if (this._started && !this.gameOver) this._scheduleFoodTimer();
  }

  stop() {
    super.stop();
    this._clearFoodTimer();
  }

  destroy() {
    this._clearFoodTimer();
    super.destroy();
  }

  _scheduleFoodTimer() {
    this._clearFoodTimer();
    const intervalMs = 1000 / (this.tickRate * FOOD_SPEED);
    this._foodTimer = setInterval(() => {
      if (this.gameOver) return;
      this._stepFood();
      // Repaint mid-tick so the new food position shows up immediately
      // instead of waiting for the next snake tick.
      this._dirty = true;
    }, intervalMs);
  }

  _clearFoodTimer() {
    if (this._foodTimer) {
      clearInterval(this._foodTimer);
      this._foodTimer = 0;
    }
  }

  /**
   * Move every pellet one cell. The food evaluates all four neighbors plus
   * staying put, scores each by wrapped Chebyshev distance to the snake
   * head, and picks uniformly at random among the candidates tied for the
   * greatest distance. The food never voluntarily steps closer to the
   * snake, and never reverses its previous move -- a pellet may go
   * forward or turn 90 degrees, but not 180.
   */
  _stepFood() {
    const { cols, rows } = this;
    const head = this._snake.segments[0];
    const occupied = new Set();
    for (const seg of this._snake.segments) {
      occupied.add(seg.x * rows + seg.y);
    }

    for (const pellet of this.food) {
      const currentDist = chebyshev(head, pellet, cols, rows);

      // Direction index from the previous step (-1 on first move). Index
      // i and its reverse pair NEIGHBOR_REVERSE[i] are forbidden if set.
      const lastDir = pellet._dir ?? -1;
      const forbiddenDir = lastDir === -1 ? -1 : NEIGHBOR_REVERSE[lastDir];

      const candidates = [];
      let best = currentDist;      for (let i = 0; i < 4; i++) {
        if (i === forbiddenDir) continue;

        const dx = NEIGHBOR_DX[i];
        const dy = NEIGHBOR_DY[i];
        const nx = pellet.x + dx;
        const ny = pellet.y + dy;
        // Food refuses to wrap around the board edges.
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        if (occupied.has(nx * rows + ny)) continue;

        const d = chebyshev(head, { x: nx, y: ny }, cols, rows);
        if (d < currentDist) continue; // never voluntarily move closer

        if (d > best) {
          best = d;
          candidates.length = 0;
          candidates.push({ x: nx, y: ny, dir: i });
        } else if (d === best) {
          candidates.push({ x: nx, y: ny, dir: i });
        }
      }

      if (candidates.length === 0) continue;

      const choice = candidates[(Math.random() * candidates.length) | 0];
      pellet.x = choice.x;
      pellet.y = choice.y;
      pellet._dir = choice.dir;
    }
  }
}

const NEIGHBOR_DX = [1, -1, 0, 0];
const NEIGHBOR_DY = [0, 0, 1, -1];
// Index pairs that are 180-degree opposites: 0<->1 (x), 2<->3 (y).
const NEIGHBOR_REVERSE = [1, 0, 3, 2];

/**
 * Shortest signed delta from `b` to `a` on a wrapped axis of size `n`.
 * Result is in (-n/2, n/2].
 */
function wrappedDelta(a, b, n) {
  let d = a - b;
  if (d > n / 2) d -= n;
  else if (d < -n / 2) d += n;
  return d;
}

/** Chebyshev (king-move) distance on a wrapped grid. */
function chebyshev(a, b, cols, rows) {
  return Math.max(
    Math.abs(wrappedDelta(a.x, b.x, cols)),
    Math.abs(wrappedDelta(a.y, b.y, rows))
  );
}
