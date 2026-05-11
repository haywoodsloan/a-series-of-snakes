/**
 * @typedef {{ x: number, y: number }} Point
 * @typedef {'up' | 'down' | 'left' | 'right'} Direction
 *
 * @typedef {Object} Snake
 * @property {Point[]} segments     Body segments, head first.
 * @property {number} length        Target length (segments grow toward this).
 * @property {Direction} direction  Current movement direction.
 * @property {string} [color]       Optional fill color.
 * @property {boolean} [dead]       Set by the engine when a collision occurs.
 *
 * @typedef {'wasd' | 'arrows'} InputKind
 *
 * @typedef {'self' | 'snake'} CollisionType
 *
 * @typedef {Object} Collision
 * @property {Snake} snake             The snake whose head moved into something.
 * @property {CollisionType} type      What was hit.
 * @property {Snake} [other]           For type='snake', the snake that was hit.
 * @property {Point} at                The cell the head ended up in.
 */

import {
  loadScores,
  qualifies,
  saveScore,
  topScore,
} from '../utils/highscores.js';

const DIRECTION_DELTAS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

const KEY_MAP = {
  // Arrows
  ArrowUp: { kind: 'arrows', dir: 'up' },
  ArrowDown: { kind: 'arrows', dir: 'down' },
  ArrowLeft: { kind: 'arrows', dir: 'left' },
  ArrowRight: { kind: 'arrows', dir: 'right' },
  // WASD
  KeyW: { kind: 'wasd', dir: 'up' },
  KeyS: { kind: 'wasd', dir: 'down' },
  KeyA: { kind: 'wasd', dir: 'left' },
  KeyD: { kind: 'wasd', dir: 'right' },
};

const FG = '#d4ffd4';
const FOOD_COLOR = '#ff6b6b';
const PLAYFIELD_BG = '#050505';
const SCORE_COLOR = '#ffd86b';
const HIGH_COLOR = '#ff9e6b';
const SCORE_FONT = '28px PublicPixel, monospace';

export default class Engine {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} [options]
   * @param {number} [options.cols=20]    Grid width in cells.
   * @param {number} [options.rows=20]    Grid height in cells.
   * @param {number} [options.tickRate=8] Logic ticks per second.
   */
  constructor(canvas, { cols = 20, rows = 20, tickRate = 8, gameKey } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Grid dimensions in cells.
    this.cols = cols;
    this.rows = rows;

    // High-score persistence key. Defaults to the constructor name in lower
    // case so subclasses get a sane per-game bucket without extra wiring.
    this.gameKey = (gameKey ?? this.constructor.name).toLowerCase();
    this.highScore = topScore(this.gameKey);

    // Game state.
    /** @type {Snake[]} */
    this.snakes = [];
    /** @type {Food[]} */
    this.food = [];
    this.score = 0;
    this.gameOver = false;

    // Loop state.
    this._raf = 0;
    this._lastFrame = 0;
    this._tickAccum = 0;
    this._tickInterval = 1 / tickRate;
    // Hard cap on time advanced per frame so a tab-resume (where RAF was
    // throttled to ~1fps) can't fire dozens of catch-up ticks in one frame
    // and freeze the game ("spiral of death").
    this._maxFrameDt = 0.25;
    this._running = false;

    // Canvas content only changes on tick/resize/state-change, not on every
    // animation frame. The loop calls `render()` only when this is true.
    this._dirty = true;

    // Cached grid layout, invalidated on canvas resize.
    this._layout = null;

    // Input handling. Subclasses register callbacks via `onInput`.
    /** @type {Set<(info: { kind: InputKind, dir: Direction, event: KeyboardEvent }) => void>} */
    this._inputHandlers = new Set();
    this._onKeyDown = this._onKeyDown.bind(this);

    // Resize handling: keep canvas backing-store in sync with its CSS size,
    // accounting for device pixel ratio. Defer the actual resize+redraw to
    // the next animation frame so the cleared canvas is repainted in the
    // same frame the browser shows the new layout (prevents flicker).
    this._resizePending = false;
    this._resizeObserver = new ResizeObserver(() => {
      if (this._resizePending) return;
      this._resizePending = true;
      requestAnimationFrame(() => {
        this._resizePending = false;
        if (this._syncCanvasSize()) {
          // Repaint synchronously in this same frame. Setting the canvas
          // backing-store width/height clears the bitmap, and the run
          // loop's own RAF may already be queued (and may have run before
          // this callback), so deferring via the dirty flag risks
          // presenting a blank frame -- visible as a one-frame flicker.
          this._dirty = false;
          this.render();
        }
      });
    });
    this._syncCanvasSize();
  }

  /**
   * Match the canvas backing-store size to its CSS size * DPR.
   * @returns {boolean} `true` if the size actually changed.
   */
  _syncCanvasSize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width === w && this.canvas.height === h) return false;
    this.canvas.width = w;
    this.canvas.height = h;
    this._layout = null;
    return true;
  }

  // ---------- Public lifecycle ----------

  start() {
    if (this._running) return;
    this._running = true;
    this._lastFrame = performance.now();
    this._tickAccum = 0;

    window.addEventListener('keydown', this._onKeyDown);
    this._resizeObserver.observe(this.canvas);

    const loop = (now) => {
      if (!this._running) return;
      // Clamp dt so background-tab catch-up can't stall the main thread.
      const dt = Math.min(this._maxFrameDt, (now - this._lastFrame) / 1000);
      this._lastFrame = now;

      // Fixed-step logic, dirty-flag rendering.
      this._tickAccum += dt;
      while (this._tickAccum >= this._tickInterval) {
        this._tickAccum -= this._tickInterval;
        this.update(this._tickInterval);
        this._dirty = true;
      }

      if (this._dirty) {
        this._dirty = false;
        this.render();
      }
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    this._running = false;
    cancelAnimationFrame(this._raf);
    window.removeEventListener('keydown', this._onKeyDown);
    // Keep the ResizeObserver attached so the post-game canvas (the dim
    // overlay over the playfield) still repaints if the viewport changes.
  }

  destroy() {
    this.stop();
    this._inputHandlers.clear();
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
  }

  /**
   * Set how many logic ticks fire per second. Takes effect immediately;
   * any partially accumulated tick time is kept so the next tick lands at
   * the new cadence without skipping or double-stepping.
   * @param {number} tickRate Ticks per second; clamped to a positive value.
   */
  setTickRate(tickRate) {
    const safe = Math.max(0.0001, Number(tickRate) || 0);
    this._tickInterval = 1 / safe;
    // Don't let a stale accumulator immediately fire many catch-up ticks
    // after a large slowdown -> speedup transition.
    if (this._tickAccum > this._tickInterval) {
      this._tickAccum = this._tickInterval;
    }
  }

  /** @returns {number} Current ticks per second. */
  get tickRate() {
    return 1 / this._tickInterval;
  }

  // ---------- Snake helpers ----------

  /**
   * Create and register a new snake.
   * @param {Object} opts
   * @param {Point} opts.head
   * @param {Direction} [opts.direction='right']
   * @param {number} [opts.length=4]
   * @param {string} [opts.color]
   * @returns {Snake}
   */
  addSnake({ head, direction = 'right', length = 4, color }) {
    const snake = {
      segments: [{ x: head.x, y: head.y }],
      length,
      direction,
      // Pending direction to commit on the next step. Decouples input
      // timing from the simulation tick so multiple key presses between
      // ticks can't combine into an illegal U-turn.
      nextDirection: direction,
      color,
    };
    this.snakes.push(snake);
    return snake;
  }

  /**
   * Advance a snake by one cell in its current direction. Grows toward
   * `snake.length`; otherwise drops the tail. Wraps the head around the
   * grid edges. Returns the new head position.
   * @param {Snake} snake
   * @returns {Point}
   */
  stepSnake(snake) {
    // Commit the queued direction at step time so each tick advances by at
    // most one direction change relative to the snake's last actual move.
    snake.direction = snake.nextDirection;

    const head = snake.segments[0];
    const delta = DIRECTION_DELTAS[snake.direction];
    // Branchless wrap: |delta| <= 1, so a single add+compare per axis is
    // enough -- avoids the double `%` modulo and the negative-modulo dance.
    let nx = head.x + delta.x;
    if (nx < 0) nx = this.cols - 1;
    else if (nx >= this.cols) nx = 0;
    let ny = head.y + delta.y;
    if (ny < 0) ny = this.rows - 1;
    else if (ny >= this.rows) ny = 0;

    const next = { x: nx, y: ny };
    snake.segments.unshift(next);
    if (snake.segments.length > snake.length) {
      snake.segments.pop();
    }
    return next;
  }

  /**
   * Step every live snake one cell, detect food pickups, and detect
   * collisions. `onEat` and `onCollision` are invoked as appropriate.
   * @returns {Collision[]} The collisions detected this tick.
   */
  stepAll() {
    /** @type {Collision[]} */
    const collisions = [];

    for (const snake of this.snakes) {
      if (snake.dead) continue;
      const at = this.stepSnake(snake);

      // Food pickup: head landed on a pellet.
      const idx = this.food.findIndex((p) => p.x === at.x && p.y === at.y);
      if (idx !== -1) {
        const eaten = this.food[idx];
        this.food.splice(idx, 1);
        this.onEat(snake, eaten);
      }

      const hit = this._detectCollision(snake, at);
      if (hit) collisions.push(hit);
    }

    for (const collision of collisions) {
      this.onCollision(collision);
    }
    return collisions;
  }

  /**
   * Check whether a snake's current head position collides with a wall, the
   * snake's own body, or another snake.
   * @param {Snake} snake
   * @param {Point} [at] Defaults to the snake's head.
   * @returns {Collision | null}
   */
  _detectCollision(snake, at = snake.segments[0]) {
    // Self: head shares a cell with any other segment of the same snake.
    const headKey = at.x * this.rows + at.y;
    const segs = snake.segments;
    for (let i = 1; i < segs.length; i++) {
      const seg = segs[i];
      if (seg.x * this.rows + seg.y === headKey) {
        return { snake, type: 'self', at };
      }
    }

    // Other snakes: head shares a cell with any segment of another live snake.
    for (const other of this.snakes) {
      if (other === snake || other.dead) continue;
      const oSegs = other.segments;
      for (let i = 0; i < oSegs.length; i++) {
        const seg = oSegs[i];
        if (seg.x * this.rows + seg.y === headKey) {
          return { snake, type: 'snake', other, at };
        }
      }
    }

    return null;
  }

  /**
   * Queue a snake's next direction. The change is applied on the next
   * `stepSnake` call. Rejects direct reversals against the snake's last
   * committed direction (not its queued one) so rapid inputs between
   * ticks cannot combine into a U-turn.
   * @param {Snake} snake
   * @param {Direction} dir
   */
  setDirection(snake, dir) {
    if (OPPOSITE[dir] === snake.direction && snake.segments.length > 1) return;
    snake.nextDirection = dir;
  }

  // ---------- Food ----------

  /**
   * Add a food pellet at the given cell.
   * @param {Point} at
   * @param {string} [color]
   * @returns {Food}
   */
  addFood(at, color) {
    const pellet = { x: at.x, y: at.y, color };
    this.food.push(pellet);
    return pellet;
  }

  /**
   * Add a food pellet at a random unoccupied cell. Returns the new pellet,
   * or `null` if there are no free cells left.
   * @param {string} [color]
   * @returns {Food | null}
   */
  addRandomFood(color) {
    const cell = this.randomEmptyCell();
    return cell ? this.addFood(cell, color) : null;
  }

  /**
   * Pick a uniformly random cell that contains no snake segment or food.
   * Returns `null` if the grid is full.
   * @returns {Point | null}
   */
  randomEmptyCell() {
    const occupied = new Set();
    for (const snake of this.snakes) {
      for (const seg of snake.segments) {
        occupied.add(seg.x * this.rows + seg.y);
      }
    }
    for (const p of this.food) occupied.add(p.x * this.rows + p.y);

    const total = this.cols * this.rows;
    if (occupied.size >= total) return null;

    // Reservoir-style pick: scan random offsets until we find a free one.
    // For typical board fill ratios this terminates in O(1) expected time.
    while (true) {
      const i = Math.floor(Math.random() * total);
      if (!occupied.has(i)) {
        return { x: Math.floor(i / this.rows), y: i % this.rows };
      }
    }
  }

  // ---------- Input ----------

  /**
   * Register a callback for keyboard input. Returns an unsubscribe fn.
   * @param {(info: { kind: InputKind, dir: Direction, event: KeyboardEvent }) => void} fn
   */
  onInput(fn) {
    this._inputHandlers.add(fn);
    return () => this._inputHandlers.delete(fn);
  }

  _onKeyDown(event) {
    const mapped = KEY_MAP[event.code];
    if (!mapped) return;
    event.preventDefault();
    const info = { kind: mapped.kind, dir: mapped.dir, event };
    for (const fn of this._inputHandlers) fn(info);
  }

  // ---------- Overridable hooks ----------

  /** Subclasses override to advance simulation by `dt` seconds. */
  update(_dt) {}

  /**
   * Called when a snake's head lands on a food pellet. Default behavior
   * grows the snake by one segment and increments the score. Subclasses
   * can override to spawn replacement food, change scoring, etc.
   * @param {Snake} snake
   * @param {Food} food
   */
  onEat(snake, _food) {
    snake.length += 1;
    this.score += 1;
  }

  /**
   * Called by `stepAll()` for every collision detected this tick. Default
   * behavior is a game over: the engine stops and `gameOver` is set so the
   * default renderer shows the overlay. Subclasses can override (e.g. mark
   * the offending snake dead and keep going for multiplayer elimination,
   * wrap walls, etc.) or extend by calling `super.onCollision(collision)`.
   * @param {Collision} collision
   */
  onCollision(_collision) {
    if (this.gameOver) return;
    this.gameOver = true;
    this._dirty = true;
    this.stop();
    const detail = {
      engine: this,
      score: this.score,
      gameKey: this.gameKey,
      qualifies: qualifies(this.gameKey, this.score),
    };
    this.canvas.dispatchEvent(new CustomEvent('gameover', { detail }));
  }

  /**
   * Persist a high-score entry under this game's key and refresh the cached
   * top score so the next render reflects it. Returns the updated list.
   * @param {string} name 3-letter initials.
   */
  submitHighScore(name) {
    const list = saveScore(this.gameKey, name, this.score);
    this.highScore = list.length ? list[0].score : 0;
    this._dirty = true;
    return list;
  }

  /** Read the current top-N scores for this game. */
  getHighScores() {
    return loadScores(this.gameKey);
  }

  // ---------- Rendering ----------

  /** Default renderer: clears, draws playfield, border, snakes, score, and
   * a "Game Over" overlay when applicable. */
  render() {
    const { ctx, canvas } = this;
    const layout = this._gridLayout();
    const { ox, oy, cell } = layout;
    const w = cell * this.cols;
    const h = cell * this.rows;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Opaque playfield background, inside the border.
    ctx.fillStyle = PLAYFIELD_BG;
    ctx.fillRect(ox, oy, w, h);

    this._drawBorder(layout, w, h);
    this._drawFood(layout);
    this._drawSnakes(layout);
    this._drawScore(layout);
    if (this.gameOver) this._drawGameOver(layout, w, h);
  }

  /**
   * Compute (and cache) square cell size and offsets that fit the canvas
   * while leaving exactly enough margin on the constraining axis for the
   * outer border to sit flush against the canvas edge.
   * @returns {{ cell: number, ox: number, oy: number, border: number }}
   */
  _gridLayout() {
    if (this._layout) return this._layout;

    // Two-pass fit: estimate border from a rough cell size, then refit
    // cells so the constraining axis has exactly 2 * border of slack.
    const borderFor = (cell) => Math.max(2, Math.round(cell * 0.1));
    const fit = (reserved) =>
      Math.min(
        (this.canvas.width - reserved) / this.cols,
        (this.canvas.height - reserved) / this.rows
      );

    const border = borderFor(fit(0));
    const cell = fit(border * 2);
    const ox = (this.canvas.width - cell * this.cols) / 2;
    const oy = (this.canvas.height - cell * this.rows) / 2;
    this._layout = { cell, ox, oy, border };
    return this._layout;
  }

  _drawBorder({ ox, oy, border: lw }, w, h) {
    const { ctx } = this;
    ctx.strokeStyle = FG;
    ctx.lineWidth = lw;
    ctx.shadowColor = FG;
    ctx.shadowBlur = lw;
    // Border sits entirely outside the playfield: stroke a rect whose
    // outer edge is lw outside the grid (centerline at -lw/2).
    ctx.strokeRect(ox - lw / 2, oy - lw / 2, w + lw, h + lw);
    ctx.shadowBlur = 0;
  }

  _drawFood({ cell, ox, oy }) {
    if (!this.food.length) return;
    const { ctx } = this;
    /** @type {Map<string, Path2D>} */
    const buckets = new Map();
    for (const p of this.food) {
      const color = p.color ?? FOOD_COLOR;
      let path = buckets.get(color);
      if (!path) {
        path = new Path2D();
        buckets.set(color, path);
      }
      path.rect(ox + p.x * cell, oy + p.y * cell, cell, cell);
    }
    for (const [color, path] of buckets) {
      ctx.fillStyle = color;
      ctx.fill(path);
    }
  }

  _drawSnakes({ cell, ox, oy }) {
    const { ctx } = this;
    // Group segments by color into a single path so each color is a single
    // GPU fill instead of a fillRect per segment.
    /** @type {Map<string, Path2D>} */
    const live = new Map();
    /** @type {Map<string, Path2D>} */
    const dead = new Map();

    for (const snake of this.snakes) {
      const color = snake.color ?? FG;
      const bucket = snake.dead ? dead : live;
      let path = bucket.get(color);
      if (!path) {
        path = new Path2D();
        bucket.set(color, path);
      }
      for (const seg of snake.segments) {
        path.rect(ox + seg.x * cell, oy + seg.y * cell, cell, cell);
      }
    }

    if (dead.size) {
      ctx.globalAlpha = 0.35;
      for (const [color, path] of dead) {
        ctx.fillStyle = color;
        ctx.fill(path);
      }
      ctx.globalAlpha = 1;
    }
    for (const [color, path] of live) {
      ctx.fillStyle = color;
      ctx.fill(path);
    }
  }

  _drawScore({ ox, oy, cell }) {
    const { ctx } = this;
    const pad = Math.max(4, Math.round(cell * 0.25));
    const w = cell * this.cols;
    ctx.font = SCORE_FONT;
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 6;

    // SCORE in the top-left, HI mirrored to the top-right.
    ctx.textAlign = 'left';
    ctx.fillStyle = SCORE_COLOR;
    ctx.fillText(`SCORE ${this.score}`, ox + pad, oy + pad);

    ctx.textAlign = 'right';
    ctx.fillStyle = HIGH_COLOR;
    ctx.fillText(`HI ${this.highScore}`, ox + w - pad, oy + pad);

    ctx.textAlign = 'start';
    ctx.shadowBlur = 0;
  }

  _drawGameOver({ ox, oy }, w, h) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(ox, oy, w, h);
  }
}
