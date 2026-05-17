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
 * @typedef {'self' | 'snake' | 'wall'} CollisionType
 *
 * @typedef {Object} Collision
 * @property {Snake} snake             The snake whose head moved into something.
 * @property {CollisionType} type      What was hit.
 * @property {Snake} [other]           For type='snake', the snake that was hit.
 * @property {Wall} [wall]             For type='wall', the wall that was hit.
 * @property {Point} at                The cell the head ended up in.
 *
 * @typedef {Object} Wall
 * @property {number} x                Grid column.
 * @property {number} y                Grid row.
 * @property {string} [color]          Optional fill color (defaults to WALL).
 */
import {
  FG,
  FOOD as FOOD_COLOR,
  HIGH as HIGH_COLOR,
  PLAYFIELD_BG,
  SCORE as SCORE_COLOR,
  WALL as WALL_COLOR,
} from '../utils/colors.js';
import {
  loadScores,
  qualifies,
  saveScore,
  topScore,
} from '../utils/highscores.js';
import { onSettingsChange, settings } from '../utils/settings.js';

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

export const SCORE_FONT = '28px PublicPixel, monospace';

/**
 * Shared speed-ramp tuning used by the default `onEat` so every game with
 * the standard "eat a pellet -> grow + speed up" loop gets identical
 * pacing without each subclass redeclaring the constants. `BASE_TICK_RATE`
 * is the starting logic ticks-per-second, `SPEED_STEP` is the per-pellet
 * increase, and `MAX_TICK_RATE` caps the ramp.
 */
export const BASE_TICK_RATE = 8;
export const SPEED_STEP = 0.4;
export const MAX_TICK_RATE = 20;

/**
 * Canonical starting length for a freshly-spawned snake. Single-snake
 * games and per-snake multiplayer games all use this so the difficulty
 * floor is identical across modes.
 */
export const STARTING_LENGTH = 3;

// Rendering constants.
const BORDER_RATIO = 0.1;            // Border thickness as fraction of cell size.
const WALL_CORE_INSET = 0.22;        // Wall core padding from cell edges (fraction of cell).
const WALL_SPIKE_TIP = 0.16;         // Spike protrusion outside the core (fraction of cell).
const WALL_SPIKES_PER_SIDE = 4;      // Triangle count along each unmerged wall edge.
const GRID_LINE_ALPHA = 0.12;        // Opacity of optional grid overlay.
const GAMEOVER_OVERLAY_ALPHA = 0.6;  // Dim layer drawn over the playfield on game over.

// randomEmptyCell tuning: cap retries so almost-full boards fall back to
// a deterministic scan instead of spinning.
const MIN_RANDOM_BUDGET = 16;
const MAX_RANDOM_BUDGET = 256;
const BUDGET_FILL_MULTIPLIER = 4;

/**
 * Fixed-step snake game engine.
 *
 * Owns the DPR-aware canvas, runs a fixed-timestep logic loop with
 * dirty-flag rendering, and manages snakes, food pellets, and static
 * wall obstacles. Provides a default renderer (playfield, border,
 * walls, food, snakes, score, game-over overlay) that subclasses can
 * extend or replace by overriding `update`, `onEat`, `onCollision`,
 * and `render`.
 */
export default class Engine {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} [options]
   * @param {number} [options.cols]                    Grid width in cells. Defaults to `settings.gridSize`.
   * @param {number} [options.rows]                    Grid height in cells. Defaults to `settings.gridSize`.
   * @param {number} [options.tickRate=BASE_TICK_RATE]  Logic ticks per second.
   */
  constructor(
    canvas,
    {
      cols = settings.gridSize,
      rows = settings.gridSize,
      tickRate = BASE_TICK_RATE,
      gameKey,
    } = {}
  ) {
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
    /** @type {Wall[]} */
    this.walls = [];
    this.score = 0;
    this.gameOver = false;

    // Loop state.
    this._raf = 0;
    this._lastFrame = 0;
    this._tickAccum = 0;
    // The game's *intrinsic* tick rate (without the user's speed multiplier).
    // `_tickInterval` is always `1 / (_baseTickRate * settings.baseSpeed)` so
    // global speed changes apply live without forcing each game subclass to
    // know about them.
    this._baseTickRate = tickRate;
    this._tickInterval = 1 / (tickRate * settings.baseSpeed);
    // React to live settings changes (speed slider, grid toggle). Speed
    // recalc reuses setTickRate so the accumulator-clamping logic there
    // also runs; grid changes just mark the canvas dirty for a redraw.
    this._unsubscribeSettings = onSettingsChange(() => {
      this.setTickRate(this._baseTickRate);
      this._dirty = true;
    });
    // Hard cap on time advanced per frame so a tab-resume (where RAF was
    // throttled to ~1fps) can't fire dozens of catch-up ticks in one frame
    // and freeze the game ("spiral of death").
    this._maxFrameDt = 0.25;
    this._running = false;

    // Fraction of the current tick interval that must have elapsed before
    // an input-driven early tick fires (see `_maybeAdvanceTickForInput`).
    // 0.5 is a sweet spot from arcade-style games: turns pressed in the
    // second half of a tick feel instant, while turns pressed right after
    // a tick stay aligned to the grid cadence so the snake doesn't appear
    // to jitter on every keypress.
    this._inputResponseThreshold = 0.5;

    // Canvas content only changes on tick/resize/state-change, not on every
    // animation frame. The loop calls `render()` only when this is true.
    this._dirty = true;

    // Cached grid layout, invalidated on canvas resize.
    this._layout = null;

    // Render/collision caches for static wall geometry. Walls never change
    // after a game starts (only seeded in subclass constructors), so the
    // O(1) cell-keyed map and the per-color Path2D buckets can be built
    // once and reused across every render and collision check. Both are
    // invalidated whenever walls mutate (`addWall`/rollback) and whenever
    // the canvas resizes (paths depend on the cached layout). The grid
    // overlay shares the same lifetime as the wall paths.
    /** @type {Map<number, Wall> | null} */
    this._wallByKey = null;
    /** @type {Map<string, Path2D> | null} */
    this._wallPaths = null;
    /** @type {Path2D | null} */
    this._gridPath = null;

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
    // Layout-dependent geometry caches must follow `_layout` so the next
    // render rebuilds them against the new cell size.
    this._wallPaths = null;
    this._gridPath = null;
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

      // Fixed-step logic with dirty-flag rendering. Each tick advances
      // the simulation by one cell on the grid; the canvas is repainted
      // only when state actually changed, giving the classic arcade
      // snap-to-grid look without per-frame redraws.
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
    this._unsubscribeSettings?.();
    this._unsubscribeSettings = null;
  }

  /**
   * Set how many logic ticks fire per second. Takes effect immediately;
   * any partially accumulated tick time is kept so the next tick lands at
   * the new cadence without skipping or double-stepping. The result is
   * always scaled by the user's global `settings.baseSpeed` multiplier.
   * @param {number} tickRate Intrinsic ticks per second; clamped positive.
   */
  setTickRate(tickRate) {
    const safe = Math.max(0.0001, Number(tickRate) || 0);
    this._baseTickRate = safe;
    const effective = safe * Math.max(0.0001, settings.baseSpeed);
    this._tickInterval = 1 / effective;
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
      // One-slot buffer for a *second* direction pressed within the same
      // tick. Without this, rapid "right then down"-style inputs between
      // ticks would overwrite each other and the snake would only take
      // the first turn. The buffered direction is validated against
      // `nextDirection` (the move that will commit first) and applied on
      // the tick after that one.
      bufferedDirection: null,
      color,
    };
    this.snakes.push(snake);
    return snake;
  }

  /**
   * Convenience helper: add a snake at a uniformly random empty cell.
   * Returns null if the grid is full. Most single-snake games use this.
   * @param {Object} [opts] Forwarded to `addSnake` (length, direction, color).
   * @returns {Snake | null}
   */
  addSnakeAtRandomCell(opts = {}) {
    const head = this.randomEmptyCell();
    if (!head) return null;
    return this.addSnake({ head, ...opts });
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
    // Drain one buffered turn (queued while `nextDirection` was already
    // pending) so a quick two-key sequence between ticks produces both
    // turns on consecutive ticks instead of dropping the first one.
    if (snake.bufferedDirection) {
      snake.nextDirection = snake.bufferedDirection;
      snake.bufferedDirection = null;
    }

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
    const headKey = at.x * this.rows + at.y;

    // Walls: head shares a cell with any static obstacle. Checked first
    // so wall hits take priority over self/other collisions on the same
    // tick (a head moving into a wall should always read as a wall death).
    // Lookup is O(1) via the cached cell-keyed wall map.
    if (this.walls.length) {
      const wall = this._wallMap().get(headKey);
      if (wall) return { snake, type: 'wall', wall, at };
    }

    // Self: head shares a cell with any other segment of the same snake.
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
    // Validate against the most recent *queued* direction so the buffered
    // turn can't form a U-turn against the move that will execute right
    // before it. If no turn is queued yet for this tick, just set it.
    if (snake.nextDirection === snake.direction) {
      if (OPPOSITE[dir] === snake.direction && snake.segments.length > 1) return;
      if (dir === snake.direction) return;
      snake.nextDirection = dir;
      // A fresh primary turn is the highest-value case for an early tick:
      // the player pressed a key expecting an immediate response.
      this._maybeAdvanceTickForInput();
      return;
    }
    // A turn is already pending for the next tick. Buffer this one to
    // apply on the tick after, rejecting reversals against the pending
    // direction and ignoring no-op repeats.
    if (OPPOSITE[dir] === snake.nextDirection && snake.segments.length > 1) return;
    if (dir === snake.nextDirection) return;
    snake.bufferedDirection = dir;
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

  // ---------- Walls ----------

  /**
   * Add a static wall obstacle at the given cell. Wall cells block snake
   * heads (a hit produces a `'wall'` collision) and are excluded from
   * random spawn placement for both food and snakes.
   * @param {Point} at
   * @param {string} [color]
   * @returns {Wall}
   */
  addWall(at, color) {
    const wall = { x: at.x, y: at.y, color };
    this.walls.push(wall);
    this._invalidateWallCaches();
    return wall;
  }

  /**
   * Drop the cell-keyed wall map and the cached draw paths so the next
   * render/collision check rebuilds them against the current wall list.
   */
  _invalidateWallCaches() {
    this._wallByKey = null;
    this._wallPaths = null;
  }

  /**
   * Lazily-built `cellKey -> Wall` lookup. Cell key is `x * rows + y` so
   * it matches the encoding used throughout the engine.
   * @returns {Map<number, Wall>}
   */
  _wallMap() {
    if (this._wallByKey) return this._wallByKey;
    const m = new Map();
    for (const w of this.walls) m.set(w.x * this.rows + w.y, w);
    this._wallByKey = m;
    return m;
  }

  /**
   * Sprinkle random walls across the grid until `ratio` of the playfield is
   * filled (defaults to 20%). Walls never overlap existing snakes, food, or
   * each other, and respect `clearance` -- a Chebyshev-distance buffer of
   * cells kept clear around every snake segment so the spawn area isn't a
   * death trap.
   *
   * Placement grows connected clusters from random seeds via orthogonal
   * expansion. Wall groups are guaranteed to contain at least 2 cells (a
   * seed that can't grow is rolled back) and stay one cell thick with no
   * loops.
   * @param {Object} [opts]
   * @param {number} [opts.ratio=0.2]            Fraction of the grid to fill.
   * @param {number} [opts.clearance=2]          Cells of buffer around snake heads/bodies.
   * @param {number} [opts.clusterSize=6]        Average cells per cluster (>= 2).
   * @param {string} [opts.color]                Optional fill color.
   * @returns {Wall[]}                           The walls added by this call.
   */
  addRandomWalls({ ratio = 0.2, clearance = 2, clusterSize = 6, color } = {}) {
    const total = this.cols * this.rows;
    const target = Math.floor(total * ratio);
    if (target <= 0) return [];

    // Build a set of cells that are forbidden for wall placement.
    const blocked = new Set();
    for (const w of this.walls) blocked.add(w.x * this.rows + w.y);
    for (const p of this.food) blocked.add(p.x * this.rows + p.y);
    for (const snake of this.snakes) {
      for (const seg of snake.segments) {
        // Reserve a Chebyshev-distance ball around each segment so the
        // snake has room to start moving without immediately hitting a
        // wall it can't see coming.
        for (let dx = -clearance; dx <= clearance; dx++) {
          for (let dy = -clearance; dy <= clearance; dy++) {
            const x = seg.x + dx;
            const y = seg.y + dy;
            if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
            blocked.add(x * this.rows + y);
          }
        }
      }
    }

    const placed = new Set();
    const added = [];
    const place = (idx) => {
      const cell = { x: Math.floor(idx / this.rows), y: idx % this.rows };
      added.push(this.addWall(cell, color));
      placed.add(idx);
    };
    const available = (idx) => !blocked.has(idx) && !placed.has(idx);
    const neighbors = (idx) => {
      const x = Math.floor(idx / this.rows);
      const y = idx % this.rows;
      const out = [];
      if (x > 0) out.push((x - 1) * this.rows + y);
      if (x < this.cols - 1) out.push((x + 1) * this.rows + y);
      if (y > 0) out.push(x * this.rows + (y - 1));
      if (y < this.rows - 1) out.push(x * this.rows + (y + 1));
      return out;
    };

    // Reject placements that would create a 2x2 (or thicker) wall block,
    // which keeps every wall group exactly one cell thick. The candidate
    // at (x, y) participates in four 2x2 boxes -- one for each corner of
    // the box that (x, y) can fill. If all three other corners of any of
    // those boxes are already walls, placing here would close a 2x2.
    const isWall = (x, y) => {
      if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false;
      return placed.has(x * this.rows + y);
    };
    const wouldThicken = (idx) => {
      const x = Math.floor(idx / this.rows);
      const y = idx % this.rows;
      // (dx, dy) ranges over the offset of the *other* corner on the
      // diagonal from (x, y); the two side neighbors of that diagonal
      // pair complete the 2x2 box.
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        if (isWall(x + dx, y + dy) && isWall(x + dx, y) && isWall(x, y + dy)) {
          return true;
        }
      }
      return false;
    };
    const canPlace = (idx) => available(idx) && !wouldThicken(idx);

    // Union-find over placed wall cells, used to reject any placement that
    // would close a loop in the wall graph. Loops (or near-loops, since a
    // closed corridor of walls is only one cell away from a full cycle) can
    // trap the snake or fence off whole regions of the board, so wall
    // groups are constrained to trees.
    /** @type {Map<number, number>} */
    const parent = new Map();
    const find = (i) => {
      let r = i;
      while (parent.get(r) !== r) r = parent.get(r);
      // Path compression so repeated queries during cluster growth stay flat.
      let n = i;
      while (parent.get(n) !== r) {
        const next = parent.get(n);
        parent.set(n, r);
        n = next;
      }
      return r;
    };
    const wouldLoop = (idx) => {
      const x = Math.floor(idx / this.rows);
      const y = idx % this.rows;
      const roots = new Set();
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (!isWall(nx, ny)) continue;
        const root = find(nx * this.rows + ny);
        if (roots.has(root)) return true; // two neighbors already connected
        roots.add(root);
      }
      return false;
    };
    const canPlaceStrict = (idx) => canPlace(idx) && !wouldLoop(idx);

    // Wraps `place` to keep the union-find in sync. Each new cell starts
    // in its own set and is unioned with every adjacent placed cell.
    const placeAndUnion = (idx) => {
      place(idx);
      parent.set(idx, idx);
      const x = Math.floor(idx / this.rows);
      const y = idx % this.rows;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (!isWall(nx, ny)) continue;
        const a = find(idx);
        const b = find(nx * this.rows + ny);
        if (a !== b) parent.set(a, b);
      }
    };

    // Pool of all candidate indices, shuffled once. Cluster seeds and
    // singleton picks both pull from the front of this list, skipping
    // entries that got consumed by an earlier cluster's growth.
    const pool = [];
    for (let i = 0; i < total; i++) {
      if (!blocked.has(i)) pool.push(i);
    }
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    let poolIdx = 0;
    const nextSeed = () => {
      while (poolIdx < pool.length) {
        const idx = pool[poolIdx++];
        if (canPlaceStrict(idx)) return idx;
      }
      return -1;
    };

    // Grow clusters via random orthogonal expansion. Each seed targets
    // ~clusterSize cells (geometric-ish: half stop early, half keep going)
    // by repeatedly picking a random open neighbor of any placed cell in
    // the cluster. A seed that can't reach at least 2 cells is rolled back
    // so the playfield never has lone single-cell walls.
    let remaining = target;
    while (remaining > 0) {
      const seed = nextSeed();
      if (seed === -1) break;
      placeAndUnion(seed);
      remaining--;

      const frontier = neighbors(seed).filter(canPlaceStrict);
      // Randomized target size around `clusterSize`, minimum 2 so a seed
      // never stands alone.
      const want = Math.max(2, Math.round(clusterSize * (0.5 + Math.random())));
      let grown = 1;
      while (grown < want && remaining > 0 && frontier.length) {
        const pick = Math.floor(Math.random() * frontier.length);
        const idx = frontier[pick];
        frontier[pick] = frontier[frontier.length - 1];
        frontier.pop();
        if (!canPlaceStrict(idx)) continue;
        placeAndUnion(idx);
        remaining--;
        grown++;
        for (const n of neighbors(idx)) {
          if (canPlaceStrict(n)) frontier.push(n);
        }
      }

      // Rollback: if this seed couldn't recruit a neighbor (boxed in by
      // blocked/placed cells or thickness/loop constraints), undo it so
      // the wall list doesn't end up with a stranded single cell. The
      // seed was already appended to `this.walls` via `addWall`, so it
      // must be popped there too -- otherwise rolled-back seeds linger as
      // invisible-to-the-placer orphans that still get rendered, and the
      // outer loop keeps trying new seeds against an ever-growing wall
      // count until the candidate pool is exhausted.
      if (grown < 2) {
        added.pop();
        this.walls.pop();
        placed.delete(seed);
        parent.delete(seed);
        remaining++;
        // `addWall` invalidated the caches when it pushed; the matching
        // pop has to do the same so the next consumer rebuilds.
        this._invalidateWallCaches();
      }
    }

    return added;
  }

  // ---------- Random placement ----------

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
    for (const w of this.walls) occupied.add(w.x * this.rows + w.y);

    // Cells orthogonally adjacent to a wall are reserved as a "buffer" so
    // food can't spawn right next to a spike -- which would either be an
    // automatic death or feel cheap to grab. The buffer is preferred but
    // not required: if filtering it out leaves no cells, fall back to any
    // non-occupied cell so callers always get a result on a non-full board.
    const buffered = new Set(occupied);
    for (const w of this.walls) {
      if (w.x > 0) buffered.add((w.x - 1) * this.rows + w.y);
      if (w.x < this.cols - 1) buffered.add((w.x + 1) * this.rows + w.y);
      if (w.y > 0) buffered.add(w.x * this.rows + (w.y - 1));
      if (w.y < this.rows - 1) buffered.add(w.x * this.rows + (w.y + 1));
    }

    const total = this.cols * this.rows;
    if (occupied.size >= total) return null;

    const useBuffer = buffered.size < total;
    const exclude = useBuffer ? buffered : occupied;

    // Reservoir-style pick: scan random offsets until we find a free one.
    // For typical board fill ratios this terminates in O(1) expected time.
    // After a budget of random tries (proportional to fill density), fall
    // back to a deterministic scan so an almost-full board can't spin.
    const free = total - exclude.size;
    const budget = Math.max(
      MIN_RANDOM_BUDGET,
      Math.min(MAX_RANDOM_BUDGET, free * BUDGET_FILL_MULTIPLIER)
    );
    for (let attempt = 0; attempt < budget; attempt++) {
      const i = Math.floor(Math.random() * total);
      if (!exclude.has(i)) {
        return { x: Math.floor(i / this.rows), y: i % this.rows };
      }
    }
    // Deterministic fallback: pick the k-th free cell where k is a random
    // index in [0, free). Guaranteed O(total) and always returns a result.
    let k = Math.floor(Math.random() * free);
    for (let i = 0; i < total; i++) {
      if (exclude.has(i)) continue;
      if (k-- === 0) return { x: Math.floor(i / this.rows), y: i % this.rows };
    }
    return null;
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
    // Auto-repeat (held key) just re-asserts the same direction the snake
    // is already heading; passing it through wastes work and, worse,
    // could displace a genuine perpendicular press out of the buffer.
    if (event.repeat) return;
    const info = { kind: mapped.kind, dir: mapped.dir, event };
    for (const fn of this._inputHandlers) fn(info);
  }

  /**
   * If a turn has been queued and the simulation is past the responsiveness
   * threshold of the current tick, advance one logic step *now* so the
   * turn lands on the player's input frame instead of waiting up to a
   * full tick interval. This is the classic "input-driven tick advance"
   * trick used by arcade games to make discrete-grid movement feel
   * frame-accurate without sacrificing fixed-step determinism: the next
   * tick still fires one full interval later, so average speed is
   * unchanged -- only the *phase* of the tick shifts toward the input.
   *
   * Called by `setDirection` whenever it actually queues a change.
   */
  _maybeAdvanceTickForInput() {
    if (!this._running || this.gameOver) return;
    // Include time elapsed since the last RAF frame so a press between
    // frames is judged against the real wall-clock phase, not the stale
    // accumulator from the previous frame.
    const now = performance.now();
    const sinceFrame = Math.max(0, (now - this._lastFrame) / 1000);
    const realAccum = this._tickAccum + sinceFrame;
    if (realAccum < this._tickInterval * this._inputResponseThreshold) return;

    this.update(this._tickInterval);
    this._dirty = true;
    // Re-baseline timing so the *next* tick is a full interval away --
    // pulling a tick forward must not also shorten the following one,
    // which would briefly double the perceived speed.
    this._lastFrame = now;
    this._tickAccum = 0;
  }

  // ---------- Overridable hooks ----------

  /** Subclasses override to advance simulation by `dt` seconds. */
  update(_dt) {}

  /**
   * Called when a snake's head lands on a food pellet. The default
   * implementation handles the canonical "grow + spawn replacement +
   * ramp speed" loop used by classic, chase, inverted, and spikes:
   *   1. Grow the snake by one segment, increment score.
   *   2. Spawn a replacement pellet at a random empty cell.
   *   3. Bump the tick rate toward MAX_TICK_RATE.
   * Subclasses can override (e.g. multi-snake shared growth) or extend
   * by calling `super.onEat(snake, food)` first.
   * @param {Snake} snake
   * @param {Food} food
   */
  onEat(snake, _food) {
    snake.length += 1;
    this.score += 1;
    this.addRandomFood();
    this.setTickRate(
      Math.min(MAX_TICK_RATE, BASE_TICK_RATE + this.score * SPEED_STEP)
    );
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

    if (settings.gridLines) this._drawGrid(layout, w, h);

    this._drawBorder(layout, w, h);
    this._drawWalls(layout);
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
    const borderFor = (cell) => Math.max(2, Math.round(cell * BORDER_RATIO));
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

  // Faint cell-boundary lines. Half-pixel offsets keep the 1px strokes
  // crisp on integer-aligned grids. The path is built once per layout and
  // re-stroked on subsequent renders; resize invalidates it via
  // `_syncCanvasSize`.
  _drawGrid({ cell, ox, oy }, w, h) {
    const { ctx } = this;
    if (!this._gridPath) {
      const path = new Path2D();
      for (let i = 1; i < this.cols; i++) {
        const x = Math.round(ox + i * cell) + 0.5;
        path.moveTo(x, oy);
        path.lineTo(x, oy + h);
      }
      for (let j = 1; j < this.rows; j++) {
        const y = Math.round(oy + j * cell) + 0.5;
        path.moveTo(ox, y);
        path.lineTo(ox + w, y);
      }
      this._gridPath = path;
    }
    ctx.save();
    ctx.strokeStyle = FG;
    ctx.globalAlpha = GRID_LINE_ALPHA;
    ctx.lineWidth = 1;
    ctx.stroke(this._gridPath);
    ctx.restore();
  }

  _drawWalls({ cell, ox, oy }) {
    if (!this.walls.length) return;
    const { ctx } = this;

    // Wall geometry is expensive to build (chamfered cores + per-edge
    // spikes per cell) and never changes during a game, so cache the
    // per-color Path2D buckets and stroke them directly on subsequent
    // renders. Caches are invalidated when walls mutate or the canvas
    // resizes (both clear `this._wallPaths`).
    if (!this._wallPaths) {
      this._wallPaths = this._buildWallPaths(cell, ox, oy);
    }
    for (const [color, path] of this._wallPaths) {
      ctx.fillStyle = color;
      ctx.fill(path);
    }
  }

  _buildWallPaths(cell, ox, oy) {
    // Each wall is a square "core" ringed by a row of small triangular
    // spikes on every side, so it reads as a hazard from any approach
    // direction. Adjacent walls visually merge: the core extends to fill
    // the cell edge on any side touching another wall, and spikes on that
    // side are omitted so a run of walls reads as one connected obstacle.
    // Group walls by color into a single Path2D per color so each render
    // is one fill call regardless of wall count.
    const inset = cell * WALL_CORE_INSET; // core padding from cell edges
    const tip = cell * WALL_SPIKE_TIP; // how far spikes reach outside the core
    const spikesPerSide = WALL_SPIKES_PER_SIDE; // count of small triangles along each edge

    // O(1) neighbor check via the cached cell-keyed wall map.
    const wallMap = this._wallMap();
    const hasWall = (x, y) =>
      x >= 0 &&
      y >= 0 &&
      x < this.cols &&
      y < this.rows &&
      wallMap.has(x * this.rows + y);

    /** @type {Map<string, Path2D>} */
    const buckets = new Map();
    for (const w of this.walls) {
      const color = w.color ?? WALL_COLOR;
      let path = buckets.get(color);
      if (!path) {
        path = new Path2D();
        buckets.set(color, path);
      }
      const x = ox + w.x * cell;
      const y = oy + w.y * cell;

      // Neighbor presence drives both core extension and spike omission.
      const nUp = hasWall(w.x, w.y - 1);
      const nDown = hasWall(w.x, w.y + 1);
      const nLeft = hasWall(w.x - 1, w.y);
      const nRight = hasWall(w.x + 1, w.y);

      // Core edges: pull a side flush with the cell edge whenever there's
      // a neighbor in that direction so the two cores' fills meet.
      const l = nLeft ? x : x + inset;
      const r = nRight ? x + cell : x + cell - inset;
      const t = nUp ? y : y + inset;
      const b = nDown ? y + cell : y + cell - inset;

      // Inner concave corners (two sides merged, diagonal empty) get a
      // 45-degree chamfer instead of a square step so the wall group
      // perimeter reads as faceted rather than blocky. The core is built
      // as a polygon (clockwise from top-left) with each corner either a
      // single point or two chamfer points.
      const chTL = nUp && nLeft && !hasWall(w.x - 1, w.y - 1);
      const chTR = nUp && nRight && !hasWall(w.x + 1, w.y - 1);
      const chBR = nDown && nRight && !hasWall(w.x + 1, w.y + 1);
      const chBL = nDown && nLeft && !hasWall(w.x - 1, w.y + 1);

      if (chTL) {
        path.moveTo(x + inset, y);
      } else {
        path.moveTo(l, t);
      }
      if (chTR) {
        path.lineTo(x + cell - inset, y);
        path.lineTo(x + cell, y + inset);
      } else {
        path.lineTo(r, t);
      }
      if (chBR) {
        path.lineTo(x + cell, y + cell - inset);
        path.lineTo(x + cell - inset, y + cell);
      } else {
        path.lineTo(r, b);
      }
      if (chBL) {
        path.lineTo(x + inset, y + cell);
        path.lineTo(x, y + cell - inset);
      } else {
        path.lineTo(l, b);
      }
      if (chTL) {
        path.lineTo(x, y + inset);
      }
      path.closePath();

      // Spikes line every *unmerged* edge of the (possibly extended) core,
      // so a wall group's outer perimeter is fully toothed -- including
      // the corner sections of cells that share one edge with a neighbor
      // but expose the perpendicular edges. Triangle count scales with
      // the edge length so spike size stays consistent across solo and
      // merged walls.
      const horiz = r - l;
      const vert = b - t;
      const horizCount = Math.max(
        1,
        Math.round((spikesPerSide * horiz) / (cell - 2 * inset))
      );
      const vertCount = Math.max(
        1,
        Math.round((spikesPerSide * vert) / (cell - 2 * inset))
      );
      const hStep = horiz / horizCount;
      const vStep = vert / vertCount;

      if (!nUp) {
        for (let i = 0; i < horizCount; i++) {
          const a = l + i * hStep;
          const b1 = a + hStep;
          const mid = a + hStep / 2;
          path.moveTo(a, t);
          path.lineTo(b1, t);
          path.lineTo(mid, t - tip);
          path.closePath();
        }
      }
      if (!nDown) {
        for (let i = 0; i < horizCount; i++) {
          const a = l + i * hStep;
          const b1 = a + hStep;
          const mid = a + hStep / 2;
          path.moveTo(a, b);
          path.lineTo(b1, b);
          path.lineTo(mid, b + tip);
          path.closePath();
        }
      }
      if (!nLeft) {
        for (let i = 0; i < vertCount; i++) {
          const a = t + i * vStep;
          const b1 = a + vStep;
          const mid = a + vStep / 2;
          path.moveTo(l, a);
          path.lineTo(l, b1);
          path.lineTo(l - tip, mid);
          path.closePath();
        }
      }
      if (!nRight) {
        for (let i = 0; i < vertCount; i++) {
          const a = t + i * vStep;
          const b1 = a + vStep;
          const mid = a + vStep / 2;
          path.moveTo(r, a);
          path.lineTo(r, b1);
          path.lineTo(r + tip, mid);
          path.closePath();
        }
      }
    }

    return buckets;
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
    ctx.fillStyle = `rgba(0, 0, 0, ${GAMEOVER_OVERLAY_ALPHA})`;
    ctx.fillRect(ox, oy, w, h);
  }
}
