import {
  ENEMY as ENEMY_COLOR,
  FG,
  FOOD,
  PLAYFIELD_BG,
  SCORE as SCORE_COLOR,
  SNAKE_ALT,
  WALL,
} from '../utils/colors.js';
import { qualifies } from '../utils/highscores.js';
import Engine, { SCORE_FONT, STARTING_LENGTH } from './engine.js';

// ---------- Tuning ----------

// Snake advances one column per tick at the engine's normal cadence; the
// rest of the side-scroller (enemies, spawn pacing) is expressed as a
// multiple or fraction of this so a single tick-rate change scales the
// whole simulation together.
const TICK_RATE = 8;

// Enemies advance ~1.2 cells per snake tick. Faster than the snake's
// own 1-cell/tick cadence so they can actually run the player down on
// the Y axis instead of perpetually trailing by half a row -- without
// this, sitting flat on any one row was enough to dodge every spawn.
const ENEMY_SPEED = 1.2;

// --- Player stats ---
const STARTING_MAX_HP = 20;
const PLAYER_ATTACK_MIN = 3;
const PLAYER_ATTACK_MAX = 6;
const RUN_COST = 5;
// Run is greyed out below this so the choice never kills the player --
// "run" should always leave at least 1 HP on the other side.
const RUN_MIN_HP = RUN_COST + 1;
// Each pellet eaten bumps both ends of the player's attack range so
// the snake scales alongside the enemies it's fighting. Matches the
// enemy ramp constants below so a mid-run trade still trends in the
// snake's favor instead of the player feeling outpaced.
const PLAYER_ATTACK_PER_FOOD = 0.4;

// --- Enemy stats ---
const ENEMY_BASE_HP = 8;
const ENEMY_ATTACK_MIN = 3;
const ENEMY_ATTACK_MAX = 5;
// Chance Counter reflects an incoming attack back at the attacker
// instead of letting it land. Always a coin flip -- counter is
// high-risk, high-reward by design, and shared by both sides.
const COUNTER_REFLECT_CHANCE = 0.5;
// Chance a swung attack actually connects. Misses fizzle entirely --
// no damage, no reflect, no HP change -- but the lunge anim still
// plays so the turn has a beat and the player can read what
// happened. Symmetric across player and enemy attacks.
const HIT_CHANCE = 0.85;
// --- Enemy combat AI ---
// Baseline chance the enemy picks attack over counter on a quiet turn
// (player did not just prime Counter, both sides at healthy HP).
const ENEMY_ATTACK_CHANCE = 0.8;
// When the player just primed Counter, attacking has a 50% reflect
// risk. Bias hard toward bracing instead -- but not all the way to
// zero so the player can't lock the AI out by spamming Counter.
const ENEMY_ATTACK_CHANCE_VS_COUNTER = 0.25;
// Wounded enemies brace more often. Triggers at or below this fraction
// of max HP, subtracts the bias from whatever the current attack
// chance is so it stacks with the vs-counter penalty.
const ENEMY_LOW_HP_RATIO = 0.3;
const ENEMY_LOW_HP_COUNTER_BIAS = 0.2;
// When the player is in one-shot range (their HP <= enemy's max
// damage) the enemy almost always swings for the kill. The single
// guard: if the player is also countering AND a reflected hit would
// finish the enemy, skip the gamble and brace instead.
const ENEMY_FINISHER_ATTACK_CHANCE = 0.98;
// Floor/ceiling so the final attack chance never collapses to 0 (AI
// becomes predictable) or 1 (AI loses all variety).
const ENEMY_ATTACK_CHANCE_MIN = 0.05;
const ENEMY_ATTACK_CHANCE_MAX = 0.95;
// Difficulty scaling: each pellet eaten bumps every freshly-spawned
// enemy's HP and attack damage. Chosen so an early-game encounter (0
// food) and a late-game encounter (10+ food) feel like distinctly
// different combat tiers without making the first food pickup feel
// punitive.
const ENEMY_HP_PER_FOOD = 1;
const ENEMY_ATTACK_PER_FOOD = 0.4;

// --- Food placement ---
// Don't spawn food immediately adjacent to a wall -- it reads as
// "impossible without grazing the ceiling/floor" and forces a strafe
// the player can't always make in time. One-cell buffer is enough to
// keep pickups reachable from a centerline approach.
const FOOD_WALL_BUFFER = 1;

// --- Combat animation ---
const ATTACK_ANIM_MS = 360;
// Duration for a Counter prep -- renders as a pulsing pixel ring on
// whichever actor primed it. Shared by both player and enemy.
const DEFEND_ANIM_MS = 320;
// Quiet beat between the player's action animation and the enemy's
// counter so the player can register damage numbers / hit flashes
// from their own turn before the enemy's animation starts. Inserted
// into the anim queue as a no-op `pause` entry.
const TURN_GAP_MS = 100;
// Floating damage numbers spawned on hits drift up over this duration
// while fading out. Slow enough that the eye has time to read the
// number even on a quick exchange.
const FLOATER_DURATION_MS = 1500;

// --- Combat sprites ---
// 16x16 pixel grids drawn at the requested size: just the face/head,
// cartoony-cute on purpose so the combat screen feels playful instead
// of grim. Both sprites are framed in a rounded outline with two big
// eyes, a bright cheek blush, and a small mouth.
// Cell codes inside each grid:
//   0 = empty
//   1 = primary body fill (caller-supplied color)
//   2 = bright accent (eye whites / shine)
//   3 = dark accent (outline / pupil / mouth)
//   4 = hot accent (cheek blush / tongue)
const SPRITE_RES = 16;
// Friendly snake face: round head, two big eyes with white sclera and
// dark pupils, pink cheek blush, and a tiny smile.
const PLAYER_SPRITE = [
  [0, 0, 0, 0, 3, 3, 3, 3, 3, 3, 3, 3, 0, 0, 0, 0],
  [0, 0, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 3, 0, 0, 0],
  [0, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 0, 0],
  [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 0],
  [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 0],
  [3, 1, 1, 1, 2, 2, 1, 1, 1, 1, 2, 2, 1, 1, 1, 3],
  [3, 1, 1, 2, 2, 3, 2, 1, 1, 2, 3, 2, 2, 1, 1, 3],
  [3, 1, 1, 2, 3, 3, 2, 1, 1, 2, 3, 3, 2, 1, 1, 3],
  [3, 1, 1, 1, 2, 2, 1, 1, 1, 1, 2, 2, 1, 1, 1, 3],
  [3, 1, 4, 4, 1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 1, 3],
  [3, 1, 4, 4, 1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 1, 3],
  [0, 3, 1, 1, 1, 1, 3, 1, 1, 3, 1, 1, 1, 1, 3, 0],
  [0, 3, 1, 1, 1, 1, 1, 3, 3, 1, 1, 1, 1, 1, 3, 0],
  [0, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 0, 0],
  [0, 0, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 3, 0, 0, 0],
  [0, 0, 0, 0, 3, 3, 3, 3, 3, 3, 3, 3, 0, 0, 0, 0],
];
// Cute lil monster face: same rounded head, two small horn nubs on
// top, big eyes with little fangs poking out of a tiny mouth.
const ENEMY_SPRITE = [
  [0, 0, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 0, 0],
  [0, 0, 3, 1, 3, 0, 0, 0, 0, 0, 0, 3, 1, 3, 0, 0],
  [0, 0, 3, 1, 1, 3, 3, 3, 3, 3, 3, 1, 1, 3, 0, 0],
  [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 0],
  [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 0],
  [3, 1, 1, 1, 2, 2, 1, 1, 1, 1, 2, 2, 1, 1, 1, 3],
  [3, 1, 1, 2, 2, 3, 2, 1, 1, 2, 3, 2, 2, 1, 1, 3],
  [3, 1, 1, 2, 3, 3, 2, 1, 1, 2, 3, 3, 2, 1, 1, 3],
  [3, 1, 1, 1, 2, 2, 1, 1, 1, 1, 2, 2, 1, 1, 1, 3],
  [3, 1, 4, 4, 1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 1, 3],
  [3, 1, 4, 4, 1, 1, 1, 1, 1, 1, 1, 1, 4, 4, 1, 3],
  [0, 3, 1, 1, 1, 1, 3, 3, 3, 3, 1, 1, 1, 1, 3, 0],
  [0, 3, 1, 1, 1, 3, 2, 3, 3, 2, 3, 1, 1, 1, 3, 0],
  [0, 0, 3, 1, 1, 1, 3, 3, 3, 3, 1, 1, 1, 3, 0, 0],
  [0, 0, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 3, 0, 0, 0],
  [0, 0, 0, 0, 3, 3, 3, 3, 3, 3, 3, 3, 0, 0, 0, 0],
];

// --- Cave generation ---
// Min wall thickness per column on roof/floor.
const CAVE_THICKNESS_MIN = 1;
// Wall can grow up to this fraction of the grid height per side.
const CAVE_THICKNESS_MAX_FRACTION = 0.3;
// Starting wall thickness (per side) when the game spawns.
const CAVE_THICKNESS_START_FRACTION = 0.15;
// Always leave at least this many open rows between roof and floor so the
// snake never finds itself in a column with nowhere to be.
const CAVE_MIN_OPEN_FRACTION = 0.3;

// --- Spawn pacing ---
// Ticks between attempted enemy spawns. Spawns can fail silently when the
// candidate cell is occupied, which makes the average pacing slightly
// sparser than these constants imply -- intentional.
const ENEMY_SPAWN_TICKS = 11;
const FOOD_SPAWN_TICKS = 22;
// Fraction of spawns that should land within `ENEMY_SPAWN_NEAR_BAND`
// rows of the snake's current Y. Without this bias enemies were too
// often dropped near the cave wall -- trivial to ignore.
const ENEMY_SPAWN_NEAR_CHANCE = 0.7;
const ENEMY_SPAWN_NEAR_BAND = 2;

// --- Transition ---
// Each half of the spiral wipe (fill or unfill) takes this long. Two
// halves bracket a phase swap, so a combat trigger plays one full
// fill+unfill before the player can act. The wipe is driven by
// `performance.now()` (wall-clock), so this duration is invariant
// across tick rate, speed setting, and play-grid size -- the
// simulation pauses for the same amount of time every time, only the
// number of discrete spiral steps per ms changes (see below).
const TRANSITION_HALF_MS = 1200;
// Target number of spiral cells along the playfield's shorter side.
// Anchoring the spiral grid to a fixed cell count instead of a
// multiple of the play cell means the wipe shows roughly the same
// number of discrete steps over the same wall-clock duration on
// every grid size. Without this, dense grids (e.g. 40x40) would
// produce 20+ spiral cells per side and the wipe felt visibly faster
// than it did on a sparse 16x16 grid even though both took 2.4s.
const SPIRAL_TARGET_CELLS = 14;

// --- Combat menu ---
const ACTIONS = ['attack', 'counter', 'run'];

/**
 * RPG: a side-scrolling mode with turn-based combat.
 *
 * Scroll phase: the snake's head is anchored to a fixed screen column;
 * each tick the world advances one column to the left. Cave walls on
 * the roof and floor squeeze the playable region. Up/Down (held) shifts
 * the head one row per tick while still advancing forward, drawing a
 * `_/` or `\_` strafe pattern. Eating food extends the snake's max HP
 * and max length; running into an enemy triggers combat.
 *
 * Combat phase: a spiral wipe transitions to a full-screen menu where
 * the player picks Attack / Counter / Run each turn. Counter skips the
 * player's attack and primes a reflect that has a 50/50 chance to
 * bounce the enemy's next attack back at them. Reducing the enemy to
 * 0 HP (or fleeing) wipes back to scroll; running out of HP ends the
 * run with the standard game-over event.
 */
export default class Rpg extends Engine {
  constructor(canvas) {
    super(canvas, { tickRate: TICK_RATE, gameKey: 'rpg' });

    // --- Player stats ---
    this._maxHp = STARTING_MAX_HP;
    this._hp = STARTING_MAX_HP;
    this._maxLength = STARTING_LENGTH;
    this._foodEaten = 0;

    // --- World/scroll state ---
    // `_snakeCol` is the fixed *screen* column of the snake's head; the
    // world scrolls past it instead of the other way around. Keeping
    // entities in world coords means collisions don't have to special-
    // case the moving camera.
    this._snakeCol = Math.max(2, Math.floor(this.cols / 4));
    this._snakeY = Math.floor(this.rows / 2);
    this._worldX = this._snakeCol;
    /** @type {Point[]} World-space snake segments, head first. */
    this._segments = [{ x: this._worldX, y: this._snakeY }];

    // --- Cave (world-keyed) ---
    /** @type {Map<number, number>} */
    this._caveRoof = new Map();
    /** @type {Map<number, number>} */
    this._caveFloor = new Map();
    this._caveMaxRoof = Math.max(
      CAVE_THICKNESS_MIN + 1,
      Math.floor(this.rows * CAVE_THICKNESS_MAX_FRACTION)
    );
    this._caveMaxFloor = this._caveMaxRoof;
    this._caveMinOpen = Math.max(
      3,
      Math.floor(this.rows * CAVE_MIN_OPEN_FRACTION)
    );
    this._lastRoof = Math.max(
      CAVE_THICKNESS_MIN,
      Math.floor(this.rows * CAVE_THICKNESS_START_FRACTION)
    );
    this._lastFloor = this._lastRoof;
    // Pre-fill the initial viewport so the player sees a full cave on
    // game start (no popping in from the right edge).
    for (let c = 0; c < this.cols; c++) this._generateCaveColumn(c);

    // --- Sprites (world coords) ---
    /** @type {{x:number,y:number,hp:number,maxHp:number,attackMin:number,attackMax:number}[]} */
    this._enemies = [];
    /** @type {{x:number,y:number}[]} */
    this._scrollerFood = [];
    this._enemySpawnAccum = 0;
    this._foodSpawnAccum = 0;
    this._enemyMoveAccum = 0;

    // --- Phase ---
    /** @type {'scroll' | 'combat'} */
    this._phase = 'scroll';
    this._combat = null;
    this._transition = null;
    this._started = false;
    this._pendingTimeout = null;

    // --- Strafe input ---
    // Track held state per modifier key so releasing one of (W, ArrowUp)
    // while the other is still held keeps the strafe alive.
    this._heldUp = false;
    this._heldDown = false;
    this._strafe = null;

    // Bound so add/remove pair up cleanly across start/stop cycles.
    this._onKeyDownRpg = (e) => this._handleKeyDown(e);
    this._onKeyUpRpg = (e) => this._handleKeyUp(e);
  }

  // ---------- Lifecycle ----------

  start() {
    super.start();
    window.addEventListener('keydown', this._onKeyDownRpg);
    window.addEventListener('keyup', this._onKeyUpRpg);
  }

  stop() {
    super.stop();
    window.removeEventListener('keydown', this._onKeyDownRpg);
    window.removeEventListener('keyup', this._onKeyUpRpg);
    this._clearPendingTimeout();
  }

  destroy() {
    this._clearPendingTimeout();
    super.destroy();
  }

  _clearPendingTimeout() {
    if (this._pendingTimeout) {
      clearTimeout(this._pendingTimeout);
      this._pendingTimeout = null;
    }
  }

  // ---------- Input ----------

  _handleKeyDown(e) {
    if (this.gameOver) return;
    const code = e.code;
    if (this._phase === 'scroll') {
      if (code === 'ArrowUp' || code === 'KeyW') {
        e.preventDefault();
        this._heldUp = true;
        this._strafe = 'up';
        this._started = true;
      } else if (code === 'ArrowDown' || code === 'KeyS') {
        e.preventDefault();
        this._heldDown = true;
        this._strafe = 'down';
        this._started = true;
      } else if (
        code === 'ArrowLeft' ||
        code === 'ArrowRight' ||
        code === 'KeyA' ||
        code === 'KeyD'
      ) {
        // Left/right don't do anything in the scroller (the snake is
        // always moving right and never backs up) but they still count
        // as "press any direction to begin" so the player isn't stuck on
        // the title until they happen to press up or down.
        this._started = true;
      }
    } else if (this._phase === 'combat') {
      this._handleCombatKey(code, e);
    }
  }

  _handleKeyUp(e) {
    const code = e.code;
    if (code === 'ArrowUp' || code === 'KeyW') {
      this._heldUp = false;
      this._strafe = this._heldDown ? 'down' : null;
    } else if (code === 'ArrowDown' || code === 'KeyS') {
      this._heldDown = false;
      this._strafe = this._heldUp ? 'up' : null;
    }
  }

  _handleCombatKey(code, event) {
    // Lock input while the spiral is mid-wipe so the player can't queue
    // turns against an off-screen menu.
    if (this._transition) return;
    const c = this._combat;
    if (!c) return;
    // Also lock input while per-turn animations are still playing out;
    // otherwise the player can mash a second action mid-lunge and the
    // log/queue desyncs.
    if (c.animQueue && c.animQueue.length > 0) return;
    if (
      code === 'ArrowLeft' ||
      code === 'KeyA' ||
      code === 'ArrowUp' ||
      code === 'KeyW'
    ) {
      event?.preventDefault();
      c.selected = this._prevAction(c.selected);
      this._dirty = true;
    } else if (
      code === 'ArrowRight' ||
      code === 'KeyD' ||
      code === 'ArrowDown' ||
      code === 'KeyS'
    ) {
      event?.preventDefault();
      c.selected = this._nextAction(c.selected);
      this._dirty = true;
    } else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
      event?.preventDefault();
      this._resolveCombatTurn(c.selected);
    } else if (code === 'Digit1') {
      this._resolveCombatTurn('attack');
    } else if (code === 'Digit2') {
      this._resolveCombatTurn('counter');
    } else if (code === 'Digit3' && this._canRun()) {
      this._resolveCombatTurn('run');
    }
  }

  _canRun() {
    return this._hp >= RUN_MIN_HP;
  }

  _selectableActions() {
    return ACTIONS.filter((a) => a !== 'run' || this._canRun());
  }

  _prevAction(cur) {
    const list = this._selectableActions();
    const i = Math.max(0, list.indexOf(cur));
    return list[(i - 1 + list.length) % list.length];
  }

  _nextAction(cur) {
    const list = this._selectableActions();
    const i = Math.max(0, list.indexOf(cur));
    return list[(i + 1) % list.length];
  }

  // ---------- Scroll loop ----------

  update() {
    if (this.gameOver || !this._started) return;
    // While the spiral wipe is animating the world is frozen -- the
    // transition's `midFn` controls the phase swap.
    if (this._transition) return;
    if (this._phase !== 'scroll') return;
    this._stepScroll();
  }

  _stepScroll() {
    // Advance world coords first so cave generation/clamps below see the
    // new column the snake is moving into.
    this._worldX += 1;

    // Generate the freshly-revealed column at the right edge before
    // strafe validation runs, so the new column's roof/floor are
    // available for the playability check.
    const rightCol = this._worldX - this._snakeCol + this.cols - 1;
    if (!this._caveRoof.has(rightCol)) this._generateCaveColumn(rightCol);

    // Strafe: at most one row shift per tick. Blocked by walls so
    // pushing into the ceiling/floor cleanly halts at the cave edge.
    let nextY = this._snakeY;
    if (this._strafe === 'up') nextY -= 1;
    else if (this._strafe === 'down') nextY += 1;
    if (nextY !== this._snakeY && this._isPlayable(this._worldX, nextY)) {
      this._snakeY = nextY;
    } else if (!this._isPlayable(this._worldX, this._snakeY)) {
      // The cave grew over the snake's current row this tick. Push the
      // head to the nearest open row so the snake never starts a tick
      // inside a wall (the cave is meant to herd, not crush).
      this._snakeY = this._nearestPlayable(this._worldX, this._snakeY);
    }

    // Append the new head segment, then trim from the tail toward the
    // visible length. Drop any segment that's scrolled off-screen left
    // so the segments array doesn't grow without bound at low HP (where
    // visible length is small but old segments would otherwise survive).
    this._segments.unshift({ x: this._worldX, y: this._snakeY });
    const visLength = this._visibleLength();
    while (this._segments.length > visLength) this._segments.pop();
    const leftWorld = this._worldX - this._snakeCol;
    while (
      this._segments.length > 1 &&
      this._segments[this._segments.length - 1].x < leftWorld
    ) {
      this._segments.pop();
    }

    // Prune any cave column that's scrolled past the left edge. Map
    // iteration order is insertion so the oldest column is the first
    // candidate; one delete per tick keeps the map size bounded.
    this._caveRoof.delete(leftWorld - 1);
    this._caveFloor.delete(leftWorld - 1);

    // Spawn pacing: cap-then-zero accumulators so adjusting the spawn
    // constants is a one-line change with no need to recompute phase.
    this._enemySpawnAccum += 1;
    if (this._enemySpawnAccum >= ENEMY_SPAWN_TICKS) {
      this._enemySpawnAccum = 0;
      this._trySpawnEnemy();
    }
    this._foodSpawnAccum += 1;
    if (this._foodSpawnAccum >= FOOD_SPAWN_TICKS) {
      this._foodSpawnAccum = 0;
      this._trySpawnFood();
    }

    // Enemy motion runs on its own accumulator so its cadence is
    // independent of the snake's tick rate (matches chase mode's food
    // timer; here just folded into the same loop instead of setInterval).
    this._enemyMoveAccum += this._tickInterval;
    const enemyInterval = 1 / Math.max(0.0001, this.tickRate * ENEMY_SPEED);
    while (this._enemyMoveAccum >= enemyInterval) {
      this._enemyMoveAccum -= enemyInterval;
      this._stepEnemies();
    }

    // Drop off-screen sprites in one pass (same predicate either side).
    this._enemies = this._enemies.filter((e) => e.x >= leftWorld);
    this._scrollerFood = this._scrollerFood.filter((f) => f.x >= leftWorld);

    // Pickups before enemy collision so a food and enemy never both
    // resolve on the same cell in the same tick.
    this._checkPickups();
    this._checkEnemyCollision();
  }

  _visibleLength() {
    // Length scales with the current-HP ratio so the visible snake
    // physically reflects how much damage it has taken. Always at least
    // one cell so a barely-alive snake still has a visible head.
    return Math.max(1, Math.round((this._maxLength * this._hp) / this._maxHp));
  }

  // ---------- Cave ----------

  _generateCaveColumn(worldX) {
    // Random walk on roof + floor thicknesses, clamped to [min, max] per
    // side, then nudged inward if the gap between them would fall below
    // `_caveMinOpen`. The result is a jagged but always-playable
    // corridor.
    const drift = () => Math.floor(Math.random() * 3) - 1;
    let roof = clamp(
      this._lastRoof + drift(),
      CAVE_THICKNESS_MIN,
      this._caveMaxRoof
    );
    let floor = clamp(
      this._lastFloor + drift(),
      CAVE_THICKNESS_MIN,
      this._caveMaxFloor
    );
    let open = this.rows - roof - floor;
    while (open < this._caveMinOpen) {
      if (
        roof > CAVE_THICKNESS_MIN &&
        (Math.random() < 0.5 || floor <= CAVE_THICKNESS_MIN)
      ) {
        roof -= 1;
      } else if (floor > CAVE_THICKNESS_MIN) {
        floor -= 1;
      } else {
        break;
      }
      open = this.rows - roof - floor;
    }
    this._lastRoof = roof;
    this._lastFloor = floor;
    this._caveRoof.set(worldX, roof);
    this._caveFloor.set(worldX, floor);
  }

  _isPlayable(worldX, y) {
    if (y < 0 || y >= this.rows) return false;
    const roof = this._caveRoof.get(worldX);
    const floor = this._caveFloor.get(worldX);
    if (roof === undefined || floor === undefined) return false;
    return y >= roof && y < this.rows - floor;
  }

  _nearestPlayable(worldX, y) {
    const roof = this._caveRoof.get(worldX) ?? 0;
    const floor = this._caveFloor.get(worldX) ?? 0;
    const top = roof;
    const bottom = this.rows - 1 - floor;
    if (y < top) return top;
    if (y > bottom) return bottom;
    return y;
  }

  // ---------- Spawning ----------

  _trySpawnEnemy() {
    // Spawn at the rightmost just-revealed column so the player has a
    // few ticks of warning before contact.
    const spawnX = this._worldX - this._snakeCol + this.cols - 1;
    // Bias the spawn row toward the snake's current Y the majority of
    // the time, so the player can't just hug a wall to make every
    // encounter trivial. The random-row fallback keeps a steady
    // baseline of full-corridor spawns.
    const useBias = Math.random() < ENEMY_SPAWN_NEAR_CHANCE;
    const y = useBias
      ? this._randomPlayableY(spawnX, 0, this._snakeY, ENEMY_SPAWN_NEAR_BAND)
      : this._randomPlayableY(spawnX);
    if (y === -1) return;
    if (this._cellHasEntity(spawnX, y)) return;
    if (spawnX === this._worldX && y === this._snakeY) return;
    const stats = this._scaledEnemyStats();
    this._enemies.push({
      x: spawnX,
      y,
      maxHp: stats.hp,
      hp: stats.hp,
      attackMin: stats.attackMin,
      attackMax: stats.attackMax,
    });
  }

  /** Enemy stats grow with food eaten so late-run encounters bite back. */
  _scaledEnemyStats() {
    const f = this._foodEaten;
    const bonusHp = Math.floor(f * ENEMY_HP_PER_FOOD);
    const bonusAtk = Math.floor(f * ENEMY_ATTACK_PER_FOOD);
    return {
      hp: ENEMY_BASE_HP + bonusHp,
      attackMin: ENEMY_ATTACK_MIN + bonusAtk,
      attackMax: ENEMY_ATTACK_MAX + bonusAtk,
    };
  }

  /**
   * Player attack range scales with food eaten using the same per-food
   * cadence as the enemy ramp. Returning a fresh object each call (vs.
   * caching) keeps `_foodEaten` and `_resolveCombatTurn` the only
   * place damage maths live and lets tests poke `_foodEaten` directly
   * to verify the ramp.
   */
  _scaledPlayerStats() {
    const f = this._foodEaten;
    const bonusAtk = Math.floor(f * PLAYER_ATTACK_PER_FOOD);
    return {
      attackMin: PLAYER_ATTACK_MIN + bonusAtk,
      attackMax: PLAYER_ATTACK_MAX + bonusAtk,
    };
  }

  _trySpawnFood() {
    // Bias slightly inward so food doesn't always appear flush with the
    // right edge alongside fresh enemies.
    const rightCol = this._worldX - this._snakeCol + this.cols - 1;
    const spawnX = rightCol - Math.floor(Math.random() * 4);
    const y = this._randomPlayableY(spawnX, FOOD_WALL_BUFFER);
    if (y === -1) return;
    if (this._cellHasEntity(spawnX, y)) return;
    this._scrollerFood.push({ x: spawnX, y });
  }

  _randomPlayableY(worldX, wallBuffer = 0, preferredY = null, band = 0) {
    const roof = this._caveRoof.get(worldX);
    const floor = this._caveFloor.get(worldX);
    if (roof === undefined || floor === undefined) return -1;
    const top = roof + wallBuffer;
    const bottom = this.rows - 1 - floor - wallBuffer;
    if (bottom < top) return -1;
    // Optional spawn-near-Y bias: clamp the random window around
    // `preferredY` ± `band`. Falls back to the full corridor if the
    // requested band sits entirely outside the playable range.
    if (preferredY != null && band > 0) {
      const lo = Math.max(top, preferredY - band);
      const hi = Math.min(bottom, preferredY + band);
      if (hi >= lo) {
        return lo + Math.floor(Math.random() * (hi - lo + 1));
      }
    }
    return top + Math.floor(Math.random() * (bottom - top + 1));
  }

  _cellHasEntity(x, y) {
    for (const e of this._enemies) if (e.x === x && e.y === y) return true;
    for (const f of this._scrollerFood) if (f.x === x && f.y === y) return true;
    return false;
  }

  // ---------- Enemy motion ----------

  _stepEnemies() {
    // 2D pursuit with axis alternation: each enemy carries a
    // `_lastAxis` memory of the axis it last successfully stepped on,
    // and the next step picks the *other* axis whenever both still
    // have distance to close. The net effect is a smooth diagonal
    // approach instead of the old greedy-largest-axis behavior, which
    // produced a long horizontal run followed by a sudden vertical
    // catch-up (the "jerky" feel). When only one axis has any
    // remaining delta the loop naturally picks it. When the preferred
    // step is blocked by a wall or another entity, we fall back to
    // the perpendicular axis so a single wall column doesn't strand
    // the chaser. Enemies still get dragged off-screen left by the
    // scroll, so X-chase keeps mattering -- without it they'd never
    // close the gap before scrolling past the snake. Enemies that
    // have slipped behind the snake (dx > 0) keep chasing on Y so
    // they still look alive (turning toward the snake as they slide
    // past), but they stop chasing on X so the world-scroll actually
    // carries them off the left edge instead of clamping them to the
    // snake's column forever (ENEMY_SPEED > 1 would otherwise let a
    // behind-enemy out-pace the scroll on the X axis indefinitely).
    for (const e of this._enemies) {
      const dx = this._worldX - e.x;
      const dy = this._snakeY - e.y;
      if (dx === 0 && dy === 0) continue;
      const behind = dx > 0;
      const stepX = behind ? 0 : Math.sign(dx);
      const stepY = Math.sign(dy);
      const hasX = stepX !== 0;
      const hasY = stepY !== 0;
      // When both axes still have distance, alternate from whichever
      // axis the enemy used last; first step defaults to X so a fresh
      // enemy with dx >= dy still leads with X (matches the long-
      // standing chase contract). When only one axis has distance,
      // pick it directly.
      let preferred;
      if (hasX && hasY) {
        preferred = e._lastAxis === 'x' ? 'y' : 'x';
      } else if (hasX) {
        preferred = 'x';
      } else {
        preferred = 'y';
      }
      const tryOrder = preferred === 'x' ? ['x', 'y'] : ['y', 'x'];
      for (const axis of tryOrder) {
        if (axis === 'x' && stepX !== 0) {
          const nx = e.x + stepX;
          if (this._isPlayable(nx, e.y) && !this._cellHasEntity(nx, e.y)) {
            e.x = nx;
            e._lastAxis = 'x';
            break;
          }
        } else if (axis === 'y' && stepY !== 0) {
          const ny = e.y + stepY;
          if (this._isPlayable(e.x, ny) && !this._cellHasEntity(e.x, ny)) {
            e.y = ny;
            e._lastAxis = 'y';
            break;
          }
        }
      }
    }
  }

  // ---------- Pickups & collisions ----------

  _checkPickups() {
    for (let i = this._scrollerFood.length - 1; i >= 0; i--) {
      const f = this._scrollerFood[i];
      if (f.x === this._worldX && f.y === this._snakeY) {
        this._scrollerFood.splice(i, 1);
        this._onFoodEaten();
      }
    }
  }

  _checkEnemyCollision() {
    for (const enemy of this._enemies) {
      if (enemy.x === this._worldX && enemy.y === this._snakeY) {
        this._beginCombat(enemy);
        return;
      }
    }
  }

  _onFoodEaten() {
    this._foodEaten += 1;
    // Score tracks food eaten -- matches the other snake game modes
    // where a pellet is the unit of progress, rather than raw
    // distance scrolled (which advances every tick regardless of
    // skill).
    this.score = this._foodEaten;
    this._maxHp += 1;
    this._maxLength += 1;
    // Pellets fully restore HP, including the freshly-granted hit
    // point. The growth ramp is a strict reward instead of a partial
    // top-up so the player feels their snake getting visibly bigger
    // and safer with each pickup.
    this._hp = this._maxHp;
    // An enemy chasing on the snake's row can park itself one cell
    // ahead of the food (its chase step is blocked by the pellet),
    // then collide the very next tick when the snake advances --
    // visually the combat trigger reads as "ate food, fight started"
    // with no enemy in sight because the snake's head sprite is drawn
    // on top of the enemy on the collision tick. Bump any such enemy
    // off the snake's row so there's at least one tick of visibility
    // between the pickup and the encounter.
    const nextX = this._worldX + 1;
    for (const e of this._enemies) {
      if (e.x !== nextX || e.y !== this._snakeY) continue;
      for (const dy of [-1, 1, -2, 2]) {
        const ny = e.y + dy;
        if (this._isPlayable(e.x, ny) && !this._cellHasEntity(e.x, ny)) {
          e.y = ny;
          break;
        }
      }
    }
  }

  // ---------- Combat ----------

  _beginCombat(enemy) {
    this._combat = {
      enemy,
      selected: 'attack',
      playerCountering: false,
      enemyCountering: false,
      // Queue of per-turn visual effects: pushed during
      // `_resolveCombatTurn` so state mutations stay synchronous (tests
      // and HP bars update instantly) while sprites get a chance to
      // emote before the player can pick the next action.
      animQueue: [],
      // Floating damage numbers spawned at the target sprite during a
      // hit. Self-expiring on render; no separate cleanup tick.
      floaters: [],
    };
    this._beginTransition({
      midFn: () => {
        this._phase = 'combat';
      },
    });
  }

  _endCombat() {
    const enemy = this._combat?.enemy;
    this._beginTransition({
      midFn: () => {
        if (enemy) {
          const idx = this._enemies.indexOf(enemy);
          if (idx !== -1) this._enemies.splice(idx, 1);
        }
        this._phase = 'scroll';
        this._combat = null;
      },
    });
  }

  /**
   * Heuristic combat AI: pick 'attack' or 'counter' based on the
   * current combat state. Consumes exactly one `Math.random()` call so
   * the test fixtures' deterministic mock sequences stay aligned with
   * the existing damage/reflect roll order.
   *
   * Signals (applied in order of priority):
   *   1. Finisher -- if the player is in one-shot range, almost always
   *      swing. Skipped only when the player is countering AND a
   *      reflected hit at max damage would kill the enemy (no point
   *      trading the kill for a self-KO).
   *   2. Player countering -- attacking risks a 50% reflect, so bias
   *      hard toward bracing instead. Never collapses to 0 so the
   *      player can't perma-stall the AI with Counter spam.
   *   3. Wounded -- enemies at or below `ENEMY_LOW_HP_RATIO` brace
   *      more often, mirroring the rational play a human would make
   *      when one more bad trade ends the fight.
   */
  _chooseEnemyAction(c) {
    const enemy = c.enemy;
    const playerOneShot = this._hp <= enemy.attackMax;
    const reflectKillsEnemy = enemy.hp <= enemy.attackMax;
    if (playerOneShot && !(c.playerCountering && reflectKillsEnemy)) {
      return Math.random() < ENEMY_FINISHER_ATTACK_CHANCE
        ? 'attack'
        : 'counter';
    }
    let attackChance = c.playerCountering
      ? ENEMY_ATTACK_CHANCE_VS_COUNTER
      : ENEMY_ATTACK_CHANCE;
    if (enemy.hp / enemy.maxHp <= ENEMY_LOW_HP_RATIO) {
      attackChance -= ENEMY_LOW_HP_COUNTER_BIAS;
    }
    attackChance = Math.max(
      ENEMY_ATTACK_CHANCE_MIN,
      Math.min(ENEMY_ATTACK_CHANCE_MAX, attackChance)
    );
    return Math.random() < attackChance ? 'attack' : 'counter';
  }

  _resolveCombatTurn(action) {
    const c = this._combat;
    if (!c) return;
    this._normalizeCombat(c);
    // Each turn a primed counter applies only to the immediately-
    // following attack from the other actor. Reset before resolving so
    // a non-counter action consumes nothing.
    const playerWasCountering = c.playerCountering;
    c.playerCountering = false;
    const enemyWasCountering = c.enemyCountering;
    c.enemyCountering = false;

    let combatEnded = false;

    if (action === 'attack') {
      // Hit roll first so a miss short-circuits the whole damage/
      // reflect chain. A whiff still queues the lunge anim (with a
      // MISS floater) so the turn has a beat the player can read.
      const hit = Math.random() < HIT_CHANCE;
      if (!hit) {
        this._queueMissAnim(c, 'player');
      } else {
        const stats = this._scaledPlayerStats();
        const damage = randInt(stats.attackMin, stats.attackMax);
        // When the enemy primed Counter the previous turn, the player's
        // swing has a coin-flip chance of bouncing back. Symmetric with
        // the enemy-vs-player counter path below.
        const reflected =
          enemyWasCountering && Math.random() < COUNTER_REFLECT_CHANCE;
        if (reflected) {
          this._hp = Math.max(0, this._hp - damage);
          // Player anim is first in the queue, so onStart fires almost
          // immediately -- still defer the floater so the HP bar drop
          // is visually tied to the lunge contact rather than the
          // synchronous resolve.
          this._queueAttackAnim(c, 'player', damage, {
            reflected: true,
            defer: true,
          });
        } else {
          c.enemy.hp = Math.max(0, c.enemy.hp - damage);
          // No defer: player anim plays first, so the floater + HP drop
          // appearing immediately reads as "hit on impact".
          this._queueAttackAnim(c, 'player', damage);
          if (c.enemy.hp <= 0) combatEnded = true;
        }
      }
    } else if (action === 'counter') {
      c.playerCountering = true;
      c.animQueue.push({
        actor: 'player',
        kind: 'counter',
        durationMs: DEFEND_ANIM_MS,
      });
    } else if (action === 'run') {
      const cost = Math.min(RUN_COST, this._hp);
      this._hp = Math.max(0, this._hp - cost);
      // No separate run anim -- the spiral wipe IS the run animation.
      combatEnded = true;
    }

    // Enemy turn only fires when combat is still live and the player
    // didn't already kill themselves on the run cost.
    if (!combatEnded && c.enemy.hp > 0 && this._hp > 0) {
      // Quiet beat between the player's animation and the enemy's so
      // the player can read their own damage numbers before the
      // counter-swing lunges in.
      if (action === 'attack' || action === 'counter') {
        c.animQueue.push({
          actor: 'none',
          kind: 'pause',
          durationMs: TURN_GAP_MS,
        });
      }
      if (this._chooseEnemyAction(c) === 'attack') {
        const hit = Math.random() < HIT_CHANCE;
        if (!hit) {
          // Defer the MISS floater to the lunge's onStart so the
          // "MISS" pops on impact rather than the instant the
          // synchronous turn resolves.
          this._queueMissAnim(c, 'enemy', { defer: true });
        } else {
          const damage = randInt(c.enemy.attackMin, c.enemy.attackMax);
          // When the player primed Counter the previous turn, the
          // enemy's swing has a coin-flip chance of bouncing back.
          const reflected =
            playerWasCountering && Math.random() < COUNTER_REFLECT_CHANCE;
          if (reflected) {
            c.enemy.hp = Math.max(0, c.enemy.hp - damage);
            this._queueAttackAnim(c, 'enemy', damage, {
              reflected: true,
              defer: true,
            });
            if (c.enemy.hp <= 0) combatEnded = true;
          } else {
            this._hp = Math.max(0, this._hp - damage);
            // Defer so the HP drop / floater happens when the enemy
            // lunge contacts, not the instant the player's turn resolves.
            this._queueAttackAnim(c, 'enemy', damage, { defer: true });
          }
        }
      } else {
        c.enemyCountering = true;
        c.animQueue.push({
          actor: 'enemy',
          kind: 'counter',
          durationMs: DEFEND_ANIM_MS,
        });
      }
    }

    // If the player just died, give the hit flash + floater a beat to
    // land before the game-over overlay takes the screen.
    if (this._hp <= 0) {
      this._dirty = true;
      this._pendingTimeout = setTimeout(() => {
        this._pendingTimeout = null;
        this._finishGame();
      }, 700);
      return;
    }

    // If the previously-selected action just became un-selectable
    // (HP fell below the run threshold), snap to Attack so the cursor
    // never sits on a disabled row.
    if (!this._canRun() && c.selected === 'run') c.selected = 'attack';

    if (combatEnded) {
      this._endCombat();
    } else {
      this._dirty = true;
    }
  }

  /**
   * Ensure a combat-state object has the auxiliary collections that the
   * renderer + resolve path read from. Tests build ad-hoc fixtures
   * without going through `_beginCombat`, so the queues may be missing;
   * production combat always starts here with both arrays present.
   */
  _normalizeCombat(c) {
    if (!c.animQueue) c.animQueue = [];
    if (!c.floaters) c.floaters = [];
  }

  /**
   * Queue an attack animation entry on the combat anim queue and wire
   * up the damage floater + pending-HP visual mask. Centralises the
   * four near-identical lunge variants (player vs enemy, normal vs
   * reflected) so the resolve logic above stays focused on the rules
   * rather than the animation plumbing.
   *
   *   attacker  -- 'player' or 'enemy' (the actor running the lunge)
   *   reflected -- true when the lunge bounces back at the attacker
   *                (visible as the lunger flashing red on contact)
   *   defer     -- true when the floater + HP-bar drop should wait
   *                for the anim to start playing (mandatory when the
   *                lunge isn't the first anim in the queue; optional
   *                when it is)
   */
  _queueAttackAnim(
    c,
    attacker,
    damage,
    { reflected = false, defer = false } = {}
  ) {
    const target = reflected
      ? attacker
      : attacker === 'player'
        ? 'enemy'
        : 'player';
    const pendingKey =
      target === 'player' ? 'pendingPlayerDamage' : 'pendingEnemyDamage';
    const anim = {
      actor: attacker,
      kind: 'attack',
      damage,
      durationMs: ATTACK_ANIM_MS,
    };
    if (reflected) anim.reflected = true;
    if (defer) {
      // Accumulate rather than assign so a second deferred lunge
      // landing on the same target doesn't stomp the first one's
      // mask (e.g. player reflects, then enemy swings: both defer
      // damage to the player's HP bar).
      c[pendingKey] = (c[pendingKey] || 0) + damage;
      anim.onStart = () => {
        this._pushFloater(target, `-${damage}`);
        c[pendingKey] = Math.max(0, (c[pendingKey] || 0) - damage);
      };
      c.animQueue.push(anim);
    } else {
      c.animQueue.push(anim);
      this._pushFloater(target, `-${damage}`);
    }
  }

  /**
   * Queue a "whiff" lunge animation for a missed attack. Same shape
   * and timing as a regular attack lunge so the combat tempo stays
   * consistent on a miss, but the entry carries `missed: true` and
   * spawns a MISS text floater on the *target* (no damage, no HP
   * mutation, no reflect). Anchoring the floater to the target keeps
   * MISS visually consistent with damage numbers -- both appear over
   * the actor whose hitbox the swing was aimed at.
   */
  _queueMissAnim(c, attacker, { defer = false } = {}) {
    const target = attacker === 'player' ? 'enemy' : 'player';
    const anim = {
      actor: attacker,
      kind: 'attack',
      missed: true,
      durationMs: ATTACK_ANIM_MS,
    };
    if (defer) {
      anim.onStart = () => this._pushFloater(target, 'MISS');
      c.animQueue.push(anim);
    } else {
      c.animQueue.push(anim);
      this._pushFloater(target, 'MISS');
    }
  }

  _finishGame() {
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

  // ---------- Transition (spiral wipe) ----------

  _beginTransition({ midFn }) {
    this._transition = {
      start: performance.now(),
      halfMs: TRANSITION_HALF_MS,
      midFn,
      midDone: false,
    };
    this._dirty = true;
  }

  /**
   * Advance the spiral wipe and return the current overlay state, or
   * null when the transition has finished (and has been cleared from
   * the engine). The returned `progress` is in [0, 1]; `unfilling` is
   * false during the first half (cells fill in from the center
   * outward) and true during the second half (cells clear in the
   * same center-out order, so the wipe shape matches the fill).
   */
  _advanceTransition(now) {
    const t = this._transition;
    if (!t) return null;
    const elapsed = now - t.start;
    if (elapsed >= 2 * t.halfMs) {
      if (!t.midDone) {
        t.midFn();
        t.midDone = true;
      }
      this._transition = null;
      return null;
    }
    if (elapsed >= t.halfMs && !t.midDone) {
      t.midFn();
      t.midDone = true;
    }
    if (elapsed < t.halfMs) {
      return { progress: elapsed / t.halfMs, unfilling: false };
    }
    return { progress: (elapsed - t.halfMs) / t.halfMs, unfilling: true };
  }

  // ---------- Rendering ----------

  render() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const spiralState = this._transition
      ? this._advanceTransition(performance.now())
      : null;

    if (this._phase === 'combat') {
      this._renderCombat();
    } else {
      this._renderScroll();
    }

    if (this._transition && spiralState) {
      this._drawSpiralOverlay(spiralState);
      // Keep the render loop hot while the wipe is animating; the
      // engine's dirty-flag loop would otherwise sleep until the next
      // tick.
      this._dirty = true;
    }

    if (this.gameOver) this._drawGameOver();
  }

  _renderScroll() {
    const layout = this._gridLayout();
    const { ox, oy, cell } = layout;
    const w = cell * this.cols;
    const h = cell * this.rows;

    this.ctx.fillStyle = PLAYFIELD_BG;
    this.ctx.fillRect(ox, oy, w, h);

    this._drawCave(layout);
    this._drawScrollerFood(layout);
    this._drawEnemies(layout);
    this._drawSnake(layout);
    this._drawBorder(layout, w, h);
    this._drawScore(layout);
    this._drawHpBar(layout);
  }

  _drawCave(layout) {
    const { ox, oy, cell } = layout;
    const leftWorld = this._worldX - this._snakeCol;
    const path = new Path2D();
    for (let c = 0; c < this.cols; c++) {
      const wx = leftWorld + c;
      const roof = this._caveRoof.get(wx) ?? 0;
      const floor = this._caveFloor.get(wx) ?? 0;
      if (roof > 0) {
        path.rect(ox + c * cell, oy, cell, roof * cell);
      }
      if (floor > 0) {
        path.rect(
          ox + c * cell,
          oy + (this.rows - floor) * cell,
          cell,
          floor * cell
        );
      }
    }
    this.ctx.fillStyle = WALL;
    this.ctx.fill(path);
  }

  _drawScrollerFood(layout) {
    if (!this._scrollerFood.length) return;
    const { ox, oy, cell } = layout;
    const leftWorld = this._worldX - this._snakeCol;
    const path = new Path2D();
    for (const f of this._scrollerFood) {
      const sx = f.x - leftWorld;
      if (sx < 0 || sx >= this.cols) continue;
      path.rect(ox + sx * cell, oy + f.y * cell, cell, cell);
    }
    this.ctx.fillStyle = FOOD;
    this.ctx.fill(path);
  }

  _drawEnemies(layout) {
    if (!this._enemies.length) return;
    const { ox, oy, cell } = layout;
    const leftWorld = this._worldX - this._snakeCol;
    const path = new Path2D();
    for (const e of this._enemies) {
      const sx = e.x - leftWorld;
      if (sx < 0 || sx >= this.cols) continue;
      path.rect(ox + sx * cell, oy + e.y * cell, cell, cell);
    }
    this.ctx.fillStyle = ENEMY_COLOR;
    this.ctx.fill(path);
  }

  _drawSnake(layout) {
    if (!this._segments.length) return;
    const { ox, oy, cell } = layout;
    const leftWorld = this._worldX - this._snakeCol;
    const path = new Path2D();
    for (const seg of this._segments) {
      const sx = seg.x - leftWorld;
      if (sx < 0 || sx >= this.cols) continue;
      path.rect(ox + sx * cell, oy + seg.y * cell, cell, cell);
    }
    this.ctx.fillStyle = FG;
    this.ctx.fill(path);
  }

  _drawHpBar(layout) {
    const { ctx } = this;
    const { ox, oy, cell } = layout;
    const w = cell * this.cols;
    const h = cell * this.rows;
    const pad = Math.max(4, Math.round(cell * 0.25));

    const barH = Math.max(8, Math.round(cell * 0.6));
    const barW = Math.min(w * 0.4, 360);
    const barX = ox + (w - barW) / 2;
    const barY = oy + h - pad - barH;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);

    const ratio = Math.max(0, Math.min(1, this._hp / this._maxHp));
    ctx.fillStyle = ratio > 0.5 ? FG : ratio > 0.25 ? SCORE_COLOR : FOOD;
    ctx.fillRect(barX, barY, barW * ratio, barH);

    ctx.font = SCORE_FONT;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = FG;
    ctx.fillText(`HP ${this._hp}/${this._maxHp}`, barX + barW / 2, barY - 4);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowBlur = 0;
  }

  _renderCombat() {
    const { ctx } = this;
    const layout = this._gridLayout();
    const { ox, oy, cell } = layout;
    const w = cell * this.cols;
    const h = cell * this.rows;
    ctx.fillStyle = PLAYFIELD_BG;
    ctx.fillRect(ox, oy, w, h);
    this._drawBorder(layout, w, h);

    const c = this._combat;
    if (!c) return;
    this._normalizeCombat(c);

    // Resolve the current animation (if any) before laying out sprites
    // so their positions and overlays can react to the in-flight turn.
    const now = performance.now();
    const anim = this._advanceCombatAnim(now);

    // Sprite geometry. Sprites live in the top ~55% of the canvas;
    // menu owns the bottom strip.
    const geom = this._combatSpriteGeom(layout);
    const { spriteSize, playerBaseX, playerBaseY, enemyBaseX, enemyBaseY } =
      geom;
    const lungeDistance = spriteSize * 0.6;

    let playerOffsetX = 0;
    let enemyOffsetX = 0;
    // Smooth ease-in/out arc for lunge: 0 at p=0 and p=1, peak at p=0.5.
    const arc = (p) => Math.sin(p * Math.PI);

    if (anim && anim.kind === 'attack') {
      if (anim.actor === 'player') {
        playerOffsetX = arc(anim.progress) * lungeDistance;
      } else {
        enemyOffsetX = -arc(anim.progress) * lungeDistance;
      }
    }

    this._drawSprite(
      playerBaseX + playerOffsetX,
      playerBaseY,
      spriteSize,
      FG,
      'player'
    );
    this._drawSprite(
      enemyBaseX + enemyOffsetX,
      enemyBaseY,
      spriteSize,
      ENEMY_COLOR,
      'enemy'
    );

    if (anim) {
      this._drawCombatAnimOverlay(anim, {
        playerX: playerBaseX + playerOffsetX,
        playerY: playerBaseY,
        enemyX: enemyBaseX + enemyOffsetX,
        enemyY: enemyBaseY,
        spriteSize,
      });
      // Keep the render loop hot so the animation timeline can advance
      // without waiting on the next logic tick.
      this._dirty = true;
    }

    // HP bars sit on the *opposite* side of each sprite (player's
    // bar on the far right, enemy's bar on the far left). The enemy
    // panel hugs the *top* of its sprite's vertical extent and the
    // player panel hugs the *bottom* of its sprite's extent -- the
    // two clusters fan apart vertically so the middle of the screen
    // is left clear for the lunge/counter animations.
    //
    // The label is drawn above the bar by `_drawCombatHpBar`, so the
    // "top-aligned" enemy bar Y has to leave room for the label
    // above it; the "bottom-aligned" player bar Y just needs its
    // bottom to land at the sprite's bottom.
    //
    // The player bar lags the actual `_hp` value by
    // `pendingPlayerDamage` until the enemy lunge anim begins, so
    // the visible drop syncs with the attack animation rather than
    // the synchronous resolve. The enemy bar does the same on a
    // reflected counter hit so the bounced damage lands when the
    // lunge contacts, not when the turn resolves.
    const { barW, playerBarX, enemyBarX } = geom;
    const barH = Math.max(14, Math.round(cell * 0.7));
    const labelFontPx = Math.max(22, Math.round(cell * 1.05));
    const enemyBarY = geom.enemyBaseY + labelFontPx + 4;
    const playerBarY = geom.playerBaseY + spriteSize - barH;
    const displayedPlayerHp = Math.min(
      this._maxHp,
      this._hp + (c.pendingPlayerDamage || 0)
    );
    const displayedEnemyHp = Math.min(
      c.enemy.maxHp,
      c.enemy.hp + (c.pendingEnemyDamage || 0)
    );
    this._drawCombatHpBar(
      playerBarX,
      playerBarY,
      barW,
      displayedPlayerHp,
      this._maxHp,
      FG,
      'PLAYER',
      layout
    );
    this._drawCombatHpBar(
      enemyBarX,
      enemyBarY,
      barW,
      displayedEnemyHp,
      c.enemy.maxHp,
      ENEMY_COLOR,
      'ENEMY',
      layout
    );

    this._drawCombatFloaters(now, geom, layout);
    this._drawCombatMenu(layout);
  }

  /**
   * Shared geometry for the combat sprites + HP panels + floating
   * numbers so render, anim overlay, and floater drift all stay in
   * lockstep when the canvas resizes mid-fight. The enemy hugs the
   * top-right corner of the upper combat panel and the player the
   * bottom-left, so the two face each other diagonally. HP panels
   * (label above bar) sit on the *inside* of each sprite -- player
   * bar right of the player, enemy bar left of the enemy -- using
   * the freed middle channel that the old "bar below sprite" layout
   * left empty. Bar width grows to fit the longest possible label
   * so "ENEMY 999/999" never spills onto the sprite.
   */
  _combatSpriteGeom(layout) {
    const { ctx } = this;
    const { ox, oy, cell } = layout;
    const w = cell * this.cols;
    const h = cell * this.rows;
    // Sprites + HP panels share the top 2/3 of the canvas. The
    // bottom 1/3 belongs to the action menu.
    const topPanelH = h * (2 / 3);
    const spriteSize = Math.min(w * 0.22, topPanelH * 0.42);
    const pad = Math.max(4, Math.round(cell * 0.25));

    // Bar width target: capped at ~22% of canvas or ~120% of the
    // sprite. Then floored at the widest worst-case label so the
    // text fits inside the bar regardless of how big maxHp grows.
    // The label font scales with `cell` (same as the floaters do),
    // so the floor on barW has to use the same scaled font when it
    // measures -- otherwise on big canvases the label outgrows the
    // bar after it's been laid out.
    const enemyMaxHp = this._combat?.enemy?.maxHp ?? 99;
    const labelFontPx = Math.max(22, Math.round(cell * 1.05));
    ctx.font = `${labelFontPx}px PublicPixel, monospace`;
    const playerLabelW = ctx.measureText(
      `PLAYER ${this._maxHp}/${this._maxHp}`
    ).width;
    const enemyLabelW = ctx.measureText(
      `ENEMY ${enemyMaxHp}/${enemyMaxHp}`
    ).width;
    const targetBarW = Math.min(w * 0.22, spriteSize * 1.2);
    const barW = Math.max(playerLabelW, enemyLabelW, targetBarW) + 4;

    // Player sprite hugs the left edge; its HP panel sits on the
    // *opposite* (right) side of the playfield. Enemy sprite mirrors
    // on the right edge with its panel on the left. This swaps the
    // two halves visually -- you read your own HP across from your
    // sprite -- and leaves a wide breathing channel between each
    // sprite and its bar so neither crowds the other.
    const playerCenterX = ox + spriteSize / 2 + pad * 2;
    const enemyCenterX = ox + w - spriteSize / 2 - pad * 2;
    const playerCenterY = oy + topPanelH * 0.66;
    const enemyCenterY = oy + topPanelH * 0.24;
    // Bars sit on the opposite side of the playfield from their
    // sprite but are pulled *inboard* from the playfield edge by
    // `barEdgePad` so they read as paired with their sprite rather
    // than floating against the wall. Tuned to ~0.7 sprite-widths /
    // ~2.5 cells -- close enough to the wall to put real distance
    // between the bar and the opposite sprite.
    const barEdgePad = Math.max(spriteSize * 0.7, cell * 2.5);
    const playerBarX = ox + w - barEdgePad - barW;
    const enemyBarX = ox + barEdgePad;

    return {
      spriteSize,
      playerCenterX,
      enemyCenterX,
      playerCenterY,
      enemyCenterY,
      playerBaseX: playerCenterX - spriteSize / 2,
      playerBaseY: playerCenterY - spriteSize / 2,
      enemyBaseX: enemyCenterX - spriteSize / 2,
      enemyBaseY: enemyCenterY - spriteSize / 2,
      barW,
      playerBarX,
      enemyBarX,
    };
  }

  /**
   * Step the per-turn animation queue forward to `now` and return the
   * currently-active anim (or null if the queue is empty). Finished
   * entries are shifted off so the caller can rely on `animQueue[0]`
   * always being the live one. Entries may carry `onStart` (fired the
   * first frame they become the head) and `onComplete` (fired when
   * they expire) callbacks so deferred visuals can fall in sync with
   * the animation timeline rather than the synchronous resolve.
   */
  _advanceCombatAnim(now) {
    const c = this._combat;
    if (!c || !c.animQueue || !c.animQueue.length) return null;
    while (c.animQueue.length) {
      const head = c.animQueue[0];
      if (head.startMs === undefined) {
        head.startMs = now;
        if (head.onStart) head.onStart();
      }
      const elapsed = now - head.startMs;
      if (elapsed < head.durationMs) {
        // Mutate the queue entry instead of spreading into a new
        // object every frame -- the renderer treats this view as
        // read-only and the entry is discarded when it expires.
        head.progress = elapsed / head.durationMs;
        return head;
      }
      if (head.onComplete) head.onComplete();
      c.animQueue.shift();
    }
    return null;
  }

  _drawCombatAnimOverlay(anim, geom) {
    const { ctx } = this;
    const { playerX, playerY, enemyX, enemyY, spriteSize } = geom;
    // Pixel cell size matches `_drawSprite` so overlays land on the
    // same grid the face icons are rasterized on.
    const cs = spriteSize / SPRITE_RES;

    if (anim.kind === 'attack') {
      // Missed lunges run the same arc as a hit but never connect, so
      // skip the contact flash entirely. The MISS floater spawned on
      // the attacker is the only visual cue, which keeps a whiff
      // visibly distinct from a successful strike.
      if (anim.missed) return;
      // Hit flash on the target sprite for the contact half of the
      // lunge. Opacity peaks at impact (progress=0.5) and fades to 0
      // by the time the attacker is back at rest. Painted as a red
      // tint over every non-empty pixel of the target's sprite grid
      // so the face itself looks like it's flushing red, rather than
      // a circle approximating the icon. A reflected enemy attack
      // flashes the *enemy* instead -- the lunge animation is the
      // same but the damage bounces back onto the lunger.
      if (anim.progress < 0.5) return;
      const flash = Math.max(0, 1 - (anim.progress - 0.5) / 0.5);
      let targetKind;
      let tx;
      let ty;
      if (anim.reflected) {
        targetKind = anim.actor === 'player' ? 'player' : 'enemy';
        tx = anim.actor === 'player' ? playerX : enemyX;
        ty = anim.actor === 'player' ? playerY : enemyY;
      } else {
        targetKind = anim.actor === 'player' ? 'enemy' : 'player';
        tx = anim.actor === 'player' ? enemyX : playerX;
        ty = anim.actor === 'player' ? enemyY : playerY;
      }
      ctx.save();
      ctx.globalAlpha = flash * 0.7;
      this._fillSpriteMask(tx, ty, spriteSize, targetKind, FOOD);
      ctx.restore();
    } else if (anim.kind === 'counter') {
      // Pulsing pixel ring around the actor. A chunky bracelet of
      // cells reads as a protective bubble while staying true to the
      // arcade pixel aesthetic of every other sprite in the game.
      // Anchored to the sprite origin so the cell grid lines up with
      // the face pixels and the ring stays perfectly symmetric. Same
      // gold tint for both actors so a primed reflect always reads as
      // the same iconography regardless of who's bracing.
      const ax = anim.actor === 'player' ? playerX : enemyX;
      const ay = anim.actor === 'player' ? playerY : enemyY;
      const ringColor = SCORE_COLOR;
      const pulse = Math.sin(anim.progress * Math.PI);
      const cx = ax + spriteSize / 2;
      const cy = ay + spriteSize / 2;
      const radius = spriteSize * 0.62;
      const thickness = Math.max(cs, spriteSize * 0.1);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.shadowColor = ringColor;
      ctx.shadowBlur = thickness * 2;
      this._fillPixelCircle(cx, cy, radius, cs, ringColor, ax, ay, thickness);
      ctx.restore();
    }
  }

  /**
   * Fill every non-empty cell of the given sprite kind's pixel grid
   * with `color`, anchored at `(x, y)` and sized to match `size`.
   * Used by the hit-flash overlay so the tint hugs the face icon
   * exactly instead of approximating it with a circle.
   */
  _fillSpriteMask(x, y, size, kind, color) {
    const { ctx } = this;
    const grid = kind === 'enemy' ? ENEMY_SPRITE : PLAYER_SPRITE;
    const cs = size / SPRITE_RES;
    ctx.fillStyle = color;
    for (let r = 0; r < SPRITE_RES; r++) {
      for (let cc = 0; cc < SPRITE_RES; cc++) {
        if (!grid[r][cc]) continue;
        ctx.fillRect(x + cc * cs, y + r * cs, cs, cs);
      }
    }
  }

  /**
   * Rasterize a circle (filled disc when `thickness` is null, ring
   * otherwise) onto pixel cells of size `cs` anchored at `(gx, gy)`.
   * Cells whose center falls inside the band are filled with `color`,
   * giving the overlay the same blocky look as the sprite grids.
   * Anchoring to the sprite origin keeps the rasterized circle
   * symmetric around its center even when the sprite itself is
   * positioned on fractional pixel coordinates. Cell rects are
   * snapped to integer device pixels (computing each cell's bounds
   * from the next cell's snapped origin) so adjacent fills share an
   * exact edge -- otherwise sub-pixel seams show between cells.
   */
  _fillPixelCircle(
    cx,
    cy,
    radius,
    cs,
    color,
    gx = 0,
    gy = 0,
    thickness = null
  ) {
    const { ctx } = this;
    const r2outer = radius * radius;
    const r2inner =
      thickness != null ? Math.max(0, (radius - thickness) ** 2) : -1;
    const relCx = cx - gx;
    const relCy = cy - gy;
    const minCol = Math.floor((relCx - radius) / cs);
    const maxCol = Math.ceil((relCx + radius) / cs);
    const minRow = Math.floor((relCy - radius) / cs);
    const maxRow = Math.ceil((relCy + radius) / cs);
    ctx.fillStyle = color;
    for (let row = minRow; row <= maxRow; row++) {
      const yTop = Math.round(gy + row * cs);
      const yBot = Math.round(gy + (row + 1) * cs);
      for (let col = minCol; col <= maxCol; col++) {
        const px = (col + 0.5) * cs;
        const py = (row + 0.5) * cs;
        const dx = px - relCx;
        const dy = py - relCy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2outer && d2 >= r2inner) {
          const xLeft = Math.round(gx + col * cs);
          const xRight = Math.round(gx + (col + 1) * cs);
          ctx.fillRect(xLeft, yTop, xRight - xLeft, yBot - yTop);
        }
      }
    }
  }

  _drawSprite(x, y, size, color, kind) {
    const { ctx } = this;
    // 16x16 multi-color sprite grids. Each cell value picks a color
    // from the shared palette:
    //   0 = empty   1 = body (caller-supplied accent)
    //   2 = bright accent (eyes/glow)
    //   3 = dark accent (pupil/recess)
    //   4 = hot accent (tongue/mouth)
    // Drawn as one Path2D per color so we still get a single fill per
    // layer instead of N draw calls.
    const grid = kind === 'enemy' ? ENEMY_SPRITE : PLAYER_SPRITE;
    const cs = size / SPRITE_RES;
    const paths = {};
    for (let r = 0; r < SPRITE_RES; r++) {
      const row = grid[r];
      for (let cc = 0; cc < SPRITE_RES; cc++) {
        const v = row[cc];
        if (!v) continue;
        if (!paths[v]) paths[v] = new Path2D();
        paths[v].rect(x + cc * cs, y + r * cs, cs, cs);
      }
    }
    // Layer order: body first, then accents on top so eyes/teeth read.
    const paletteColors = {
      1: color,
      2: SCORE_COLOR,
      3: PLAYFIELD_BG,
      4: FOOD,
    };
    for (const v of [1, 4, 2, 3]) {
      if (!paths[v]) continue;
      ctx.fillStyle = paletteColors[v];
      ctx.fill(paths[v]);
    }
  }

  _drawCombatHpBar(x, y, w, hp, maxHp, color, label, layout) {
    const { ctx } = this;
    const cell = (layout ?? this._gridLayout()).cell;
    const barH = Math.max(14, Math.round(cell * 0.7));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(x - 2, y - 2, w + 4, barH + 4);
    const ratio = Math.max(0, Math.min(1, hp / maxHp));
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * ratio, barH);

    // Label font scales with cell so it grows with the bar on big
    // canvases. Floor matches _combatSpriteGeom's measurement font.
    const labelFontPx = Math.max(22, Math.round(cell * 1.05));
    ctx.font = `${labelFontPx}px PublicPixel, monospace`;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 6;
    ctx.fillText(`${label} ${hp}/${maxHp}`, x, y - 4);
    ctx.textBaseline = 'alphabetic';
    ctx.shadowBlur = 0;
  }

  /**
   * Spawn a floating damage number above the given actor's sprite. The
   * floater's startMs is assigned lazily by the renderer so the spawn
   * time aligns with when it first becomes visible rather than when the
   * combat resolve ran.
   */
  _pushFloater(actor, text) {
    const c = this._combat;
    if (!c) return;
    if (!c.floaters) c.floaters = [];
    c.floaters.push({
      actor,
      text,
      // Random horizontal jitter in [-0.5, 0.5] of sprite size so
      // back-to-back hits don't overlap exactly.
      jitter: Math.random() - 0.5,
      durationMs: FLOATER_DURATION_MS,
      startMs: undefined,
    });
  }

  _drawCombatFloaters(now, geom, layout) {
    const c = this._combat;
    if (!c || !c.floaters || !c.floaters.length) return;
    const { ctx } = this;
    const cell = (layout ?? this._gridLayout()).cell;
    const fontPx = Math.max(20, Math.round(cell * 1.4));
    ctx.font = `${fontPx}px PublicPixel, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';

    for (let i = c.floaters.length - 1; i >= 0; i--) {
      const f = c.floaters[i];
      if (f.startMs === undefined) f.startMs = now;
      const t = (now - f.startMs) / f.durationMs;
      if (t >= 1) {
        c.floaters.splice(i, 1);
        continue;
      }
      const isEnemy = f.actor === 'enemy';
      const cx =
        (isEnemy ? geom.enemyCenterX : geom.playerCenterX) +
        f.jitter * geom.spriteSize * 0.4;
      // Spawn the number near the sprite's vertical midpoint so it
      // visibly appears "on" the actor rather than already floating
      // above the head.
      const top =
        (isEnemy ? geom.enemyBaseY : geom.playerBaseY) + geom.spriteSize * 0.5;
      // Ease-out drift: quick rise then slow. Total travel kept short
      // (~70% of sprite height) so the number doesn't rocket off the
      // top of the panel before the player can read it.
      const drift = geom.spriteSize * 0.7 * (1 - (1 - t) * (1 - t));
      ctx.globalAlpha = Math.max(0, 1 - t);
      // MISS uses the score-bar gold so a whiff reads as "non-damage"
      // at a glance; hit floaters keep the red damage tint.
      ctx.fillStyle = f.text === 'MISS' ? SCORE_COLOR : FOOD;
      ctx.shadowBlur = 8;
      ctx.fillText(f.text, cx, top - drift);
      // Keep redrawing while any floater is alive.
      this._dirty = true;
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  _drawCombatMenu(layout) {
    const { ctx } = this;
    const { ox, oy, cell } = layout;
    const h = cell * this.rows;
    const c = this._combat;
    if (!c) return;

    // Bottom panel: action labels stacked vertically and left-aligned.
    // No header banner -- combat context is implied by the sprites
    // above. Menu owns the bottom 1/3 of the canvas; sprites the top 2/3.
    const topPanelH = h * (2 / 3);
    const panelTop = oy + topPanelH;
    const panelH = h - topPanelH;

    // Action labels render bigger than the rest of the UI so they
    // dominate the bottom panel. Size scales with both cell and panel
    // height so the labels stay readable on small canvases without
    // overflowing on large ones. Calibrated to ~75% of the earlier
    // "too big" sizing.
    const slotH0 = (panelH * (0.86 - 0.18)) / ACTIONS.length;
    const fontPx = Math.max(
      21,
      Math.round(Math.min(cell * 1.8, slotH0 * 0.525))
    );
    ctx.font = `${fontPx}px PublicPixel, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 6;

    // Left-aligned action stack. Inset from the playfield edge by a
    // couple of cells so labels don't kiss the border. Split the
    // panel evenly across the action slots so the cursor lands at the
    // same baseline for every option.
    const labelX = ox + Math.max(cell * 1.5, 24);
    // Render the cursor arrow and the action label in separate
    // fillText calls so we can tighten the gap between them without
    // shifting the arrow column. The PublicPixel `>` glyph is roughly
    // 0.7 fontPx wide; the +35px nudge keeps the text from kissing
    // the chevron tip while still reading as a single cursor+label
    // unit.
    const arrowGap = Math.round(fontPx * 0.8) + 35;
    const textX = labelX + arrowGap;
    // The PublicPixel `>` glyph sits noticeably high inside its em-box
    // even with textBaseline='middle', so the chevron looks like it's
    // hovering above the letters' visual center. A small downward
    // nudge lines the cursor up with the cap-height midline of
    // ATTACK / COUNTER / RUN.
    const arrowYNudge = Math.round(fontPx * 0.05) - 5;
    const actionsTop = panelTop + panelH * 0.18;
    const actionsBottom = panelTop + panelH * 0.86;
    const slotH = (actionsBottom - actionsTop) / ACTIONS.length;
    for (let i = 0; i < ACTIONS.length; i++) {
      const action = ACTIONS[i];
      const selectable = action !== 'run' || this._canRun();
      const selected = c.selected === action;
      const cy = actionsTop + slotH * (i + 0.5);
      ctx.fillStyle = !selectable
        ? 'rgba(212, 255, 212, 0.3)'
        : selected
          ? SCORE_COLOR
          : FG;
      if (selected) ctx.fillText('>', labelX, cy + arrowYNudge);
      ctx.fillText(action.toUpperCase(), textX, cy);
    }
    ctx.shadowBlur = 0;
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  _drawSpiralOverlay(state) {
    if (!state) return;
    const { progress, unfilling } = state;
    const { ctx } = this;
    const layout = this._gridLayout();
    const { ox, oy } = layout;
    // The spiral fills only the playfield box (the bordered game
    // area), not the entire canvas. Cell size is derived from the
    // playfield's shorter side and `SPIRAL_TARGET_CELLS` so the wipe
    // shows the same number of discrete steps regardless of how
    // dense the play grid is -- a 16x16 grid and a 40x40 grid wipe
    // at the same visible cadence over the same 2.4s window.
    const fieldW = layout.cell * this.cols;
    const fieldH = layout.cell * this.rows;
    const cell = Math.max(
      8,
      Math.round(Math.min(fieldW, fieldH) / SPIRAL_TARGET_CELLS)
    );
    const cols = Math.ceil(fieldW / cell);
    const rows = Math.ceil(fieldH / cell);
    // Center the spiral grid inside the playfield so the leftover
    // slack is split evenly between left/right and top/bottom edges.
    const oxGrid = ox + (fieldW - cols * cell) / 2;
    const oyGrid = oy + (fieldH - rows * cell) / 2;

    const order = buildSpiralOrder(cols, rows);
    const total = order.length;
    // Floor instead of round so cells are revealed/cleared at a
    // strictly monotonic pace -- one square per step as progress
    // climbs. During the fill phase we draw indices [0, count);
    // during the unfill phase we draw indices [count, total) so cells
    // are removed in the SAME center-out spiral order they were laid
    // down in, instead of unwinding from the outside back to the
    // middle.
    const stepped = Math.min(total, Math.floor(progress * total));
    const startIdx = unfilling ? stepped : 0;
    const endIdx = unfilling ? total : stepped;
    if (endIdx <= startIdx) return;

    // Flat blue fill -- no glow, no head highlight. Every visited cell
    // is fully covered in SNAKE_ALT so the wipe reads as a snake
    // walking outward in a square spiral, GameCube-logo style. Clip
    // to the playfield so cells whose scaled bounds spill past the
    // border get trimmed cleanly at the edge.
    ctx.save();
    const clip = new Path2D();
    clip.rect(ox, oy, fieldW, fieldH);
    ctx.clip(clip);
    const path = new Path2D();
    for (let i = startIdx; i < endIdx; i++) {
      const { x, y } = order[i];
      path.rect(oxGrid + x * cell, oyGrid + y * cell, cell, cell);
    }
    ctx.fillStyle = SNAKE_ALT;
    ctx.fill(path);
    ctx.restore();
  }

  _drawGameOver() {
    const { ctx, canvas } = this;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function clamp(v, lo, hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Cell visitation order for a `cols`x`rows` grid that walks a true
 * square spiral outward from the center: right, up, left x2, down x2,
 * right x3, up x3, left x4, down x4, ... -- the classic "Ulam spiral"
 * walk. Every cell is visited exactly once on a single contiguous
 * path, so rendering the first N entries fills exactly N cells with no
 * gaps and the trailing edge always forms a recognizable spiral arm
 * (GameCube-logo style) rather than a smoothly expanding blob.
 *
 * Cached on the function itself per (cols, rows) -- the path is
 * deterministic and rebuilding it every frame would dominate the
 * animation's cost on large canvases.
 */
function buildSpiralOrder(cols, rows) {
  const cache = (buildSpiralOrder._cache ??= new Map());
  const key = `${cols}x${rows}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const total = cols * rows;
  // Start at the center-most cell. For even dimensions there is no
  // single center cell; the floor pick is consistent so the spiral
  // looks symmetric within rounding error.
  let x = Math.floor((cols - 1) / 2);
  let y = Math.floor((rows - 1) / 2);
  const out = [];
  out.push({ x, y });

  // Standard 4-direction walk with the run length doubling every two
  // direction changes: 1, 1, 2, 2, 3, 3, 4, 4, ... Steps that fall
  // outside the grid are walked but not emitted -- that keeps the
  // spiral correctly aligned on rectangles whose center is offset from
  // the geometric middle.
  const dirs = [
    [1, 0], // right
    [0, -1], // up
    [-1, 0], // left
    [0, 1], // down
  ];
  let dir = 0;
  let runLen = 1;
  while (out.length < total) {
    for (let twice = 0; twice < 2 && out.length < total; twice++) {
      const [dx, dy] = dirs[dir];
      for (let s = 0; s < runLen && out.length < total; s++) {
        x += dx;
        y += dy;
        if (x >= 0 && x < cols && y >= 0 && y < rows) {
          out.push({ x, y });
        }
      }
      dir = (dir + 1) % 4;
    }
    runLen++;
  }

  cache.set(key, out);
  return out;
}
