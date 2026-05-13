import Engine from './engine.js';

// Food moves at this fraction of the snake's tick rate, on its own timer
// so its cadence is independent of the simulation tick. Decoupling avoids
// the stutter that comes from quantizing food motion to snake ticks.
const FOOD_SPEED = 0.35;

export default class Chase extends Engine {
  constructor(canvas) {
    super(canvas);

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
   * Move every pellet one cell. The food always moves to whichever legal
   * neighbor has the greatest wrapped Chebyshev distance to the snake
   * head, breaking ties deterministically by neighbor index order
   * (right, left, down, up). Constraints: never voluntarily steps closer
   * to the snake, never wraps across an edge, and never reverses its
   * previous move. The food may not stay still when at least one legal
   * move exists -- if both the no-reverse and no-closer rules would leave
   * the pellet stuck, the no-reverse rule is relaxed so it always moves.
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
      const lastDir = pellet._dir ?? -1;
      const forbiddenDir = lastDir === -1 ? -1 : NEIGHBOR_REVERSE[lastDir];

      // First pass: best legal neighbor that respects every rule
      // (no-reverse, no-wrap, no-occupy, no-closer). Take any valid move.
      let bestX = -1;
      let bestY = -1;
      let bestDir = -1;
      let best = -Infinity;

      for (let i = 0; i < 4; i++) {
        if (i === forbiddenDir) continue;
        const nx = pellet.x + NEIGHBOR_DX[i];
        const ny = pellet.y + NEIGHBOR_DY[i];
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        if (occupied.has(nx * rows + ny)) continue;
        const d = chebyshev(head, { x: nx, y: ny }, cols, rows);
        if (d < currentDist) continue;
        if (d > best) {
          best = d;
          bestX = nx;
          bestY = ny;
          bestDir = i;
        }
      }

      // Fallback: if nothing satisfied the no-reverse rule, allow a
      // reverse so the pellet still moves. Same other constraints.
      if (bestDir === -1) {
        for (let i = 0; i < 4; i++) {
          const nx = pellet.x + NEIGHBOR_DX[i];
          const ny = pellet.y + NEIGHBOR_DY[i];
          if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
          if (occupied.has(nx * rows + ny)) continue;
          const d = chebyshev(head, { x: nx, y: ny }, cols, rows);
          if (d < currentDist) continue;
          if (d > best) {
            best = d;
            bestX = nx;
            bestY = ny;
            bestDir = i;
          }
        }
      }

      // If even the fallback couldn't find a move (truly cornered by snake
      // segments on all sides), the pellet has no choice but to stay put.
      if (bestDir === -1) continue;

      pellet.x = bestX;
      pellet.y = bestY;
      pellet._dir = bestDir;
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
