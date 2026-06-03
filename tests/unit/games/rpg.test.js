import { afterEach, describe, expect, it, vi } from 'vitest';
import Rpg from '~/games/rpg.js';

import {
  createEngine,
  dispatchKey,
  setupEngineTest,
} from '../../helpers/engine.js';

setupEngineTest();

/** Dispatch a keyup event so strafe-release behavior is testable. */
const dispatchKeyUp = (code, init = {}) =>
  window.dispatchEvent(new KeyboardEvent('keyup', { code, ...init }));

/**
 * Build a combat fixture with sensible defaults. Every combat-related
 * test reaches in and sets `game._combat` directly (bypassing
 * `_beginCombat`), so this helper keeps the boilerplate from drifting
 * across the file and gives every fixture the auxiliary queues the
 * renderer + resolve path now expect.
 */
const makeCombat = (overrides = {}) => ({
  enemy: { hp: 50, maxHp: 50, attackMin: 4, attackMax: 4 },
  selected: 'attack',
  log: [],
  playerCountering: false,
  enemyCountering: false,
  animQueue: [],
  floaters: [],
  ...overrides,
});

// Per-test cleanup: each combat test pins `Math.random` with `vi.spyOn`,
// and Vitest's auto-restore depends on config. Doing it explicitly here
// keeps tests order-independent.
afterEach(() => {
  vi.restoreAllMocks();
});

describe('Rpg constructor', () => {
  it('seeds initial state with snake, full HP, and a generated cave', () => {
    const game = createEngine(Rpg);
    expect(game._hp).toBe(game._maxHp);
    expect(game._hp).toBeGreaterThan(0);
    expect(game._segments).toHaveLength(1);
    // Cave columns cover the entire visible area at game start so the
    // player sees a full corridor on frame one (no "popping in" on the
    // right edge).
    for (let c = 0; c < game.cols; c++) {
      expect(game._caveRoof.has(c)).toBe(true);
      expect(game._caveFloor.has(c)).toBe(true);
    }
    expect(game._phase).toBe('scroll');
    expect(game._combat).toBeNull();
    expect(game._transition).toBeNull();
    expect(game._started).toBe(false);
  });

  it('places the head inside the playable corridor', () => {
    const game = createEngine(Rpg);
    expect(game._isPlayable(game._worldX, game._snakeY)).toBe(true);
  });
});

describe('Rpg input + scroll', () => {
  it('starts on first directional input', () => {
    const game = createEngine(Rpg);
    game.start();
    dispatchKey('ArrowRight');
    game.stop();
    expect(game._started).toBe(true);
  });

  it('update is a no-op while idle or game over', () => {
    const game = createEngine(Rpg);
    const startX = game._worldX;
    game.update();
    expect(game._worldX).toBe(startX);
    game._started = true;
    game.gameOver = true;
    game.update();
    expect(game._worldX).toBe(startX);
  });

  it('advances the snake forward one column per tick and increments score', () => {
    const game = createEngine(Rpg);
    game._started = true;
    const startX = game._worldX;
    game.update();
    expect(game._worldX).toBe(startX + 1);
    expect(game.score).toBe(1);
    game.update();
    expect(game.score).toBe(2);
  });

  it('strafe-up shifts the head one row up while still advancing forward', () => {
    const game = createEngine(Rpg);
    game.start();
    const startY = game._snakeY;
    const startX = game._worldX;
    dispatchKey('ArrowUp');
    game.update();
    game.stop();
    expect(game._worldX).toBe(startX + 1);
    expect(game._snakeY).toBeLessThan(startY);
  });

  it('releasing the strafe key stops the row shift', () => {
    const game = createEngine(Rpg);
    game.start();
    dispatchKey('ArrowUp');
    game.update();
    const yAfterFirst = game._snakeY;
    dispatchKeyUp('ArrowUp');
    game.update();
    game.stop();
    expect(game._snakeY).toBe(yAfterFirst);
  });

  it('walls block strafe so the snake never enters the cave', () => {
    const game = createEngine(Rpg);
    game._started = true;
    // Place the snake one row below the roof and force the next column
    // to have an even thicker roof so strafing up would land in a wall.
    const nextCol = game._worldX + 1;
    game._caveRoof.set(nextCol, game._snakeY);
    game._caveFloor.set(nextCol, Math.max(1, game.rows - game._snakeY - 2));
    const startY = game._snakeY;
    game._strafe = 'up';
    game.update();
    // Y should be unchanged because target row was a wall.
    expect(game._snakeY).toBe(startY);
  });

  it('keeps the segments array bounded by the visible length', () => {
    const game = createEngine(Rpg);
    game._started = true;
    for (let i = 0; i < 20; i++) game.update();
    expect(game._segments.length).toBeLessThanOrEqual(game._visibleLength());
  });
});

describe('Rpg food pickups', () => {
  it('eating food heals, and grows max HP and max length by 1', () => {
    const game = createEngine(Rpg);
    game._started = true;
    game._hp = game._maxHp - 1; // take a single point of damage first
    const startMaxHp = game._maxHp;
    const startMaxLength = game._maxLength;
    game._scrollerFood.push({ x: game._worldX + 1, y: game._snakeY });
    game.update();
    expect(game._maxHp).toBe(startMaxHp + 1);
    expect(game._maxLength).toBe(startMaxLength + 1);
    expect(game._hp).toBe(game._maxHp); // healed and capped at new max
    expect(game._scrollerFood).toHaveLength(0);
  });

  it('an enemy parked one cell behind the eaten pellet gets bumped off the snake row so the next tick does not feel like an invisible collision', () => {
    const game = createEngine(Rpg);
    game._started = true;
    // Open the corridor so a side-row exists for the enemy to dodge into.
    for (let c = game._worldX; c <= game._worldX + 3; c++) {
      game._caveRoof.set(c, 0);
      game._caveFloor.set(c, 0);
    }
    game._scrollerFood.push({ x: game._worldX + 1, y: game._snakeY });
    const enemy = {
      x: game._worldX + 2,
      y: game._snakeY,
      hp: 8,
      maxHp: 8,
      attackMin: 2,
      attackMax: 4,
    };
    game._enemies.push(enemy);
    // Snake advances onto the food cell; food is eaten; enemy was
    // sitting one cell past the pellet on the same row, so the bump
    // should kick in and move it off snakeY.
    game.update();
    expect(game._scrollerFood).toHaveLength(0);
    expect(game._combat).toBeNull();
    expect(enemy.y).not.toBe(game._snakeY);
  });
});

describe('Rpg combat', () => {
  it('walking into an enemy starts combat (transition active, _combat populated)', () => {
    const game = createEngine(Rpg);
    game._started = true;
    const enemy = {
      x: game._worldX + 1,
      y: game._snakeY,
      hp: 8,
      maxHp: 8,
      attackMin: 2,
      attackMax: 4,
    };
    game._enemies.push(enemy);
    game.update();
    expect(game._combat).not.toBeNull();
    expect(game._combat.enemy).toBe(enemy);
    expect(game._transition).not.toBeNull();
  });

  it('attack deals 1+ damage to the enemy', () => {
    const game = createEngine(Rpg);
    game._combat = makeCombat({
      enemy: { hp: 20, maxHp: 20, attackMin: 0, attackMax: 0 },
    });
    // Pin the enemy roll to 0 so its damage doesn't interfere with the
    // attack assertion below.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    game._phase = 'combat';
    game._resolveCombatTurn('attack');
    expect(game._combat.enemy.hp).toBeLessThan(20);
  });

  it('counter reflects the enemy attack back when the coin flip succeeds', () => {
    const game = createEngine(Rpg);
    const startHp = game._hp;
    // Pre-load `playerCountering` to simulate a prior turn where the
    // player chose Counter; pick Counter again so the player consumes
    // no random rolls before the enemy turn -- only the enemy-chance,
    // damage, and reflect rolls run, in that order.
    game._combat = makeCombat({
      selected: 'counter',
      playerCountering: true,
    });
    // Random()=0 picks attack (< ENEMY_ATTACK_CHANCE), lands min damage
    // on every roll, and passes the < COUNTER_REFLECT_CHANCE check.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    game._phase = 'combat';
    game._resolveCombatTurn('counter');
    // Player takes no damage; the 4 hp of damage bounces back at the
    // enemy instead.
    expect(game._hp).toBe(startHp);
    expect(game._combat.enemy.hp).toBe(46);
    // The enemy's lunge anim carries the `reflected` flag so the
    // overlay can flash the lunger instead of the defender.
    const lunge = game._combat.animQueue.find(
      (a) => a.actor === 'enemy' && a.kind === 'attack'
    );
    expect(lunge).toBeDefined();
    expect(lunge.reflected).toBe(true);
  });

  it('counter still lets damage land when the reflect coin flip fails', () => {
    const game = createEngine(Rpg);
    const startHp = game._hp;
    game._combat = makeCombat({
      selected: 'counter',
      playerCountering: true,
    });
    // Sequence (counter action consumes no rolls before the enemy
    // turn): enemy-attack-chance (0 -> attack), enemy damage randInt
    // (0 -> min), reflect roll (0.99 -> fails). Damage hits the
    // player at full strength like a regular attack would.
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99)
      .mockReturnValue(0);
    game._phase = 'combat';
    game._resolveCombatTurn('counter');
    expect(startHp - game._hp).toBe(4);
    expect(game._combat.enemy.hp).toBe(50);
  });

  it('player attack bounces back when the enemy primed counter and the reflect roll succeeds', () => {
    const game = createEngine(Rpg);
    const startHp = game._hp;
    game._combat = makeCombat({
      enemy: { hp: 50, maxHp: 50, attackMin: 0, attackMax: 0 },
      enemyCountering: true,
    });
    // Sequence: player damage randInt (0 -> min = 3), reflect roll
    // (0 -> succeeds), then enemy attack chance (0 -> attack) and
    // damage (0 -> min = 0, harmless). The player's own 3 damage
    // bounces back onto the player.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    game._phase = 'combat';
    game._resolveCombatTurn('attack');
    expect(startHp - game._hp).toBe(3);
    expect(game._combat.enemy.hp).toBe(50);
    const lunge = game._combat.animQueue.find(
      (a) => a.actor === 'player' && a.kind === 'attack'
    );
    expect(lunge).toBeDefined();
    expect(lunge.reflected).toBe(true);
  });

  it('player attack lands normally when the enemy primed counter but the reflect roll fails', () => {
    const game = createEngine(Rpg);
    const startHp = game._hp;
    game._combat = makeCombat({
      enemy: { hp: 50, maxHp: 50, attackMin: 0, attackMax: 0 },
      enemyCountering: true,
    });
    // Sequence: player damage randInt (0 -> 3), reflect roll
    // (0.99 -> fails), enemy attack chance (0 -> attack) and damage
    // (0 -> 0 harmless). Player damage lands on the enemy as usual.
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99)
      .mockReturnValue(0);
    game._phase = 'combat';
    game._resolveCombatTurn('attack');
    expect(game._hp).toBe(startHp);
    expect(game._combat.enemy.hp).toBe(47);
  });

  it('run costs HP and ends combat via transition', () => {
    const game = createEngine(Rpg);
    const enemy = {
      x: game._worldX,
      y: game._snakeY,
      hp: 8,
      maxHp: 8,
      attackMin: 2,
      attackMax: 4,
    };
    game._enemies.push(enemy);
    game._combat = makeCombat({ enemy, selected: 'run' });
    game._phase = 'combat';
    const startHp = game._hp;
    game._resolveCombatTurn('run');
    expect(game._hp).toBeLessThan(startHp);
    expect(game._transition).not.toBeNull();
  });

  it('run is disabled at low HP', () => {
    const game = createEngine(Rpg);
    game._hp = 3;
    expect(game._canRun()).toBe(false);
    expect(game._selectableActions()).toEqual(['attack', 'counter']);
  });

  it('player death ends the game and dispatches a gameover event', () => {
    vi.useFakeTimers();
    try {
      const game = createEngine(Rpg);
      game._combat = makeCombat({
        enemy: { hp: 50, maxHp: 50, attackMin: 50, attackMax: 50 },
      });
      game._phase = 'combat';
      let fired = false;
      game.canvas.addEventListener('gameover', () => {
        fired = true;
      });
      // Force the enemy to swing for max damage by pinning the roll.
      vi.spyOn(Math, 'random').mockReturnValue(0);
      game._resolveCombatTurn('attack');
      expect(game._hp).toBe(0);
      vi.advanceTimersByTime(800);
      expect(fired).toBe(true);
      expect(game.gameOver).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Rpg enemy AI', () => {
  it('braces instead of attacking when the player has Counter primed and the AI rolls above the lowered threshold', () => {
    const game = createEngine(Rpg);
    game._combat = makeCombat({ playerCountering: true });
    game._phase = 'combat';
    // 0.5 lands above ENEMY_ATTACK_CHANCE_VS_COUNTER (0.25) but well
    // below the base 0.8 -- the old flat-chance AI would have attacked
    // here, the new one should brace.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const action = game._chooseEnemyAction(game._combat);
    expect(action).toBe('counter');
  });

  it('still attacks against a countering player when the dice come up low (no perma-stall)', () => {
    const game = createEngine(Rpg);
    game._combat = makeCombat({ playerCountering: true });
    game._phase = 'combat';
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(game._chooseEnemyAction(game._combat)).toBe('attack');
  });

  it('wounded enemies brace more often than healthy ones at the same roll', () => {
    const game = createEngine(Rpg);
    // 0.7 is above (base - low-hp bias) = 0.8 - 0.2 = 0.6 but below
    // the base 0.8, so a healthy enemy attacks and a wounded one
    // braces on the exact same roll.
    vi.spyOn(Math, 'random').mockReturnValue(0.7);
    const healthy = createEngine(Rpg);
    healthy._combat = makeCombat();
    expect(healthy._chooseEnemyAction(healthy._combat)).toBe('attack');
    const wounded = createEngine(Rpg);
    wounded._combat = makeCombat({
      enemy: { hp: 2, maxHp: 50, attackMin: 4, attackMax: 4 },
    });
    expect(wounded._chooseEnemyAction(wounded._combat)).toBe('counter');
    // Silence the unused-engine warning on the helper.
    expect(game).toBeDefined();
  });

  it('goes for the kill when the player is in one-shot range', () => {
    const game = createEngine(Rpg);
    game._hp = 2; // below enemy.attackMax = 4 -> one-shot range
    game._combat = makeCombat();
    // 0.5 is above the vs-counter threshold but below the finisher
    // 0.98 -- only the finisher branch will attack here.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(game._chooseEnemyAction(game._combat)).toBe('attack');
  });

  it('declines the suicide finisher when the player is countering and a reflected hit would kill the enemy', () => {
    const game = createEngine(Rpg);
    game._hp = 2;
    game._combat = makeCombat({
      enemy: { hp: 3, maxHp: 50, attackMin: 4, attackMax: 4 },
      playerCountering: true,
    });
    // High roll so the (lowered) attack chance can't recover -- the
    // finisher is skipped, then the vs-counter branch picks counter.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    expect(game._chooseEnemyAction(game._combat)).toBe('counter');
  });

  it('consumes exactly one Math.random() roll per call so callers can stack mocks predictably', () => {
    // The resolve path relies on a fixed per-action roll budget --
    // _chooseEnemyAction is wedged between the player-attack-reflect
    // roll and the enemy damage roll, so any extra rolls here would
    // silently desync every mockReturnValueOnce sequence in the suite.
    const game = createEngine(Rpg);
    game._combat = makeCombat();
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    game._chooseEnemyAction(game._combat);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('Rpg pending-damage visual mask', () => {
  it('defers the visible enemy-damage drop until the enemy lunge starts', () => {
    const game = createEngine(Rpg);
    const startHp = game._hp;
    game._combat = makeCombat();
    game._phase = 'combat';
    // Pin all rolls to 0: enemy picks attack, swings for min damage.
    // The player picked attack first, so the queue is
    //   [playerAttack, pause, enemyAttack] -- the enemy lunge is
    //   third, so its damage must stay masked behind
    //   pendingPlayerDamage until that anim starts.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    game._resolveCombatTurn('attack');
    // HP has already dropped synchronously...
    expect(game._hp).toBeLessThan(startHp);
    // ...but the renderer should see displayed = hp + pending == startHp
    // until the enemy lunge's onStart fires.
    expect(game._combat.pendingPlayerDamage).toBeGreaterThan(0);
    expect(game._hp + game._combat.pendingPlayerDamage).toBe(startHp);
  });

  it('reflected player-attack damage routes to the player (not the enemy) and is masked the same way', () => {
    const game = createEngine(Rpg);
    const startHp = game._hp;
    game._combat = makeCombat({
      enemy: { hp: 50, maxHp: 50, attackMin: 0, attackMax: 0 },
      enemyCountering: true,
    });
    game._phase = 'combat';
    vi.spyOn(Math, 'random').mockReturnValue(0);
    game._resolveCombatTurn('attack');
    expect(game._combat.enemy.hp).toBe(50);
    expect(game._hp).toBeLessThan(startHp);
    // Reflected player attacks defer their floater to onStart, so
    // pendingPlayerDamage masks the bar until the player lunge begins.
    expect(game._combat.pendingPlayerDamage).toBeGreaterThan(0);
  });
});

describe('Rpg cave', () => {
  it('always keeps the corridor at least _caveMinOpen rows tall', () => {
    const game = createEngine(Rpg);
    for (let c = 0; c < game.cols; c++) {
      const roof = game._caveRoof.get(c);
      const floor = game._caveFloor.get(c);
      expect(game.rows - roof - floor).toBeGreaterThanOrEqual(
        game._caveMinOpen
      );
    }
  });

  it('generates new columns as the world scrolls', () => {
    const game = createEngine(Rpg);
    game._started = true;
    const oldRightmost = game._worldX - game._snakeCol + game.cols - 1;
    game.update();
    const newRightmost = game._worldX - game._snakeCol + game.cols - 1;
    expect(newRightmost).toBe(oldRightmost + 1);
    expect(game._caveRoof.has(newRightmost)).toBe(true);
  });
});

describe('Rpg enemies', () => {
  it('chase toward the snake on both axes', () => {
    const game = createEngine(Rpg);
    // Place the snake somewhere predictable, then put an enemy diagonally
    // away from it in an otherwise empty column. After one step the
    // enemy should be one cell closer on the axis with the larger gap.
    game._snakeY = 5;
    const ex = game._worldX + 4;
    const ey = 2;
    // Make sure the target column exists and is fully open (no walls
    // along the chase path) so movement isn't blocked.
    for (let c = game._worldX; c <= ex + 1; c++) {
      game._caveRoof.set(c, 0);
      game._caveFloor.set(c, 0);
    }
    game._enemies.push({
      x: ex,
      y: ey,
      hp: 8,
      maxHp: 8,
      attackMin: 2,
      attackMax: 4,
    });
    game._stepEnemies();
    const e = game._enemies[0];
    // dx=4 > dy=3, so the greedy chase should step on X first.
    expect(e.x).toBe(ex - 1);
    expect(e.y).toBe(ey);
  });

  it('falls back to the other axis when the preferred direction is blocked', () => {
    const game = createEngine(Rpg);
    game._snakeY = 5;
    const ex = game._worldX + 4;
    const ey = 2;
    for (let c = game._worldX; c <= ex + 1; c++) {
      game._caveRoof.set(c, 0);
      game._caveFloor.set(c, 0);
    }
    // Wall off the preferred X step by making column ex-1 entirely
    // unplayable at row ey (roof grows to cover row ey). The chaser
    // should then fall back to a Y step toward the snake.
    game._caveRoof.set(ex - 1, ey + 1);
    game._caveFloor.set(ex - 1, 0);
    game._enemies.push({
      x: ex,
      y: ey,
      hp: 8,
      maxHp: 8,
      attackMin: 2,
      attackMax: 4,
    });
    game._stepEnemies();
    const e = game._enemies[0];
    expect(e.x).toBe(ex);
    expect(e.y).toBe(ey + 1);
  });

  it('alternates axes on consecutive steps to produce a smooth diagonal approach', () => {
    const game = createEngine(Rpg);
    game._snakeY = 6;
    const ex = game._worldX + 4;
    const ey = 2;
    // Wide-open corridor along the entire approach path.
    for (let c = game._worldX - 1; c <= ex + 1; c++) {
      game._caveRoof.set(c, 0);
      game._caveFloor.set(c, 0);
    }
    const enemy = {
      x: ex,
      y: ey,
      hp: 8,
      maxHp: 8,
      attackMin: 2,
      attackMax: 4,
    };
    game._enemies.push(enemy);
    // First step: no prior axis -> defaults to X. dx=-4, dy=4.
    game._stepEnemies();
    expect(enemy.x).toBe(ex - 1);
    expect(enemy.y).toBe(ey);
    // Second step: last axis was X, both axes still have distance ->
    // should swap to Y instead of grinding X again.
    game._stepEnemies();
    expect(enemy.x).toBe(ex - 1);
    expect(enemy.y).toBe(ey + 1);
    // Third step: last axis was Y -> back to X.
    game._stepEnemies();
    expect(enemy.x).toBe(ex - 2);
    expect(enemy.y).toBe(ey + 1);
    // Fourth step: alternation continues.
    game._stepEnemies();
    expect(enemy.x).toBe(ex - 2);
    expect(enemy.y).toBe(ey + 2);
  });

  it('newly-spawned enemies get tougher as the player eats food', () => {
    const game = createEngine(Rpg);
    const baseStats = game._scaledEnemyStats();
    game._foodEaten = 5;
    const tougherStats = game._scaledEnemyStats();
    expect(tougherStats.hp).toBeGreaterThan(baseStats.hp);
    expect(tougherStats.attackMax).toBeGreaterThan(baseStats.attackMax);
    expect(tougherStats.attackMin).toBeGreaterThanOrEqual(baseStats.attackMin);
  });

  it('stops chasing once an enemy has slid behind the snake', () => {
    const game = createEngine(Rpg);
    game._snakeY = 5;
    // After enough scroll the world advances past a missed enemy: in
    // engine coords, dx = worldX - enemy.x is positive once the enemy
    // is behind the snake's column. Whether or not y differs, the
    // chase AI should freeze so the world-scroll alone carries it off
    // the left edge instead of jittering uselessly behind the player.
    const ex = game._worldX - 3;
    const ey = 2;
    for (let c = ex - 1; c <= game._worldX + 1; c++) {
      game._caveRoof.set(c, 0);
      game._caveFloor.set(c, 0);
    }
    game._enemies.push({
      x: ex,
      y: ey,
      hp: 8,
      maxHp: 8,
      attackMin: 2,
      attackMax: 4,
    });
    game._stepEnemies();
    const e = game._enemies[0];
    expect(e.x).toBe(ex);
    expect(e.y).toBe(ey);
  });
});

describe('Rpg food spawn buffer', () => {
  it('skips rows directly adjacent to the cave walls', () => {
    const game = createEngine(Rpg);
    // Force a known cave column with roof=2 and floor=2 so playable
    // rows are 2..rows-1-2 inclusive; with a 1-cell buffer, only
    // 3..rows-1-3 should ever be picked.
    const col = game._worldX;
    game._caveRoof.set(col, 2);
    game._caveFloor.set(col, 2);
    for (let i = 0; i < 50; i++) {
      const y = game._randomPlayableY(col, 1);
      expect(y).toBeGreaterThanOrEqual(3);
      expect(y).toBeLessThanOrEqual(game.rows - 1 - 3);
    }
  });

  it('returns -1 when the corridor is too narrow for the buffer', () => {
    const game = createEngine(Rpg);
    const col = game._worldX;
    // Open gap of exactly 2 cells -- a 1-cell buffer on each side
    // collapses the eligible range, so the spawner should bail rather
    // than ignoring the buffer.
    game._caveRoof.set(col, Math.floor(game.rows / 2) - 1);
    game._caveFloor.set(col, Math.floor(game.rows / 2) - 1);
    expect(game._randomPlayableY(col, 1)).toBe(-1);
  });
});

describe('Rpg combat animation', () => {
  it('queues an attack animation when the player strikes', () => {
    const game = createEngine(Rpg);
    game._combat = makeCombat({
      enemy: { hp: 20, maxHp: 20, attackMin: 0, attackMax: 0 },
    });
    game._phase = 'combat';
    vi.spyOn(Math, 'random').mockReturnValue(0);
    game._resolveCombatTurn('attack');
    expect(game._combat.animQueue.length).toBeGreaterThan(0);
    expect(game._combat.animQueue[0]).toMatchObject({
      actor: 'player',
      kind: 'attack',
    });
  });

  it('spawns a floating damage number on the enemy when the player strikes', () => {
    const game = createEngine(Rpg);
    game._combat = makeCombat({
      enemy: { hp: 20, maxHp: 20, attackMin: 0, attackMax: 0 },
    });
    game._phase = 'combat';
    vi.spyOn(Math, 'random').mockReturnValue(0);
    game._resolveCombatTurn('attack');
    expect(game._combat.floaters.length).toBeGreaterThan(0);
    expect(game._combat.floaters[0].actor).toBe('enemy');
    // Damage text is a negative number (player damaging enemy).
    expect(game._combat.floaters[0].text).toMatch(/^-\d+$/);
  });

  it('locks input while the animation queue is non-empty', () => {
    const game = createEngine(Rpg);
    game._combat = makeCombat({
      enemy: { hp: 20, maxHp: 20, attackMin: 0, attackMax: 0 },
      animQueue: [
        { actor: 'player', kind: 'attack', durationMs: 1000, startMs: 1 },
      ],
    });
    game._phase = 'combat';
    // While the queue is full, _handleCombatKey should ignore navigation
    // entirely -- the cursor must not move and no turn may resolve.
    const startHp = game._combat.enemy.hp;
    game._handleCombatKey('ArrowDown', { preventDefault() {} });
    expect(game._combat.selected).toBe('attack');
    game._handleCombatKey('Enter', { preventDefault() {} });
    expect(game._combat.enemy.hp).toBe(startHp);
  });
});

describe('Rpg spiral wipe', () => {
  it('renders without throwing when a transition is active', () => {
    const game = createEngine(Rpg);
    game._started = true;
    const enemy = {
      x: game._worldX + 1,
      y: game._snakeY,
      hp: 8,
      maxHp: 8,
      attackMin: 2,
      attackMax: 4,
    };
    game._enemies.push(enemy);
    game.update();
    expect(game._transition).not.toBeNull();
    expect(() => game.render()).not.toThrow();
  });
});

describe('Rpg render does not throw', () => {
  it('renders the scroll phase', () => {
    const game = createEngine(Rpg);
    expect(() => game.render()).not.toThrow();
  });

  it('renders the combat phase', () => {
    const game = createEngine(Rpg);
    game._phase = 'combat';
    game._combat = makeCombat({
      enemy: { hp: 5, maxHp: 8, attackMin: 2, attackMax: 4 },
      log: ['ENCOUNTERED AN ENEMY', 'YOU STRIKE FOR 3'],
    });
    expect(() => game.render()).not.toThrow();
  });
});

describe('Rpg scroll input edges', () => {
  // Coverage for the left/right "press any key to begin" branch -- left
  // and right intentionally don't move the snake in the scroller, but
  // they still flip `_started` so the title screen unblocks.
  it.each([['ArrowLeft'], ['ArrowRight'], ['KeyA'], ['KeyD']])(
    '%s in scroll phase starts the game without strafing',
    (code) => {
      const game = createEngine(Rpg);
      game.start();
      const startY = game._snakeY;
      dispatchKey(code);
      game.stop();
      expect(game._started).toBe(true);
      expect(game._strafe).toBeNull();
      expect(game._snakeY).toBe(startY);
    }
  );

  it('ignores keydown after game over', () => {
    const game = createEngine(Rpg);
    game.gameOver = true;
    game.start();
    dispatchKey('ArrowUp');
    game.stop();
    expect(game._heldUp).toBe(false);
    expect(game._strafe).toBeNull();
  });

  it('releasing up while down is still held keeps the strafe pointing down', () => {
    const game = createEngine(Rpg);
    game.start();
    // Press both: down then up so _strafe ends up tracking the most
    // recent press, but _heldDown stays true.
    dispatchKey('ArrowDown');
    dispatchKey('ArrowUp');
    expect(game._strafe).toBe('up');
    expect(game._heldDown).toBe(true);
    // Release the up key -- _heldDown is still true, so the strafe
    // must fall back to 'down' rather than clearing entirely.
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp' }));
    game.stop();
    expect(game._strafe).toBe('down');
  });

  it('releasing down while up is still held keeps the strafe pointing up', () => {
    const game = createEngine(Rpg);
    game.start();
    dispatchKey('ArrowUp');
    dispatchKey('ArrowDown');
    expect(game._strafe).toBe('down');
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowDown' }));
    game.stop();
    expect(game._strafe).toBe('up');
  });
});

describe('Rpg _handleCombatKey edges', () => {
  it('Digit3 is a no-op when HP is below the run threshold', () => {
    const game = createEngine(Rpg);
    game._hp = 1; // forces _canRun() -> false
    game._combat = makeCombat({
      enemy: { hp: 20, maxHp: 20, attackMin: 0, attackMax: 0 },
    });
    game._phase = 'combat';
    const spy = vi.spyOn(game, '_resolveCombatTurn');
    game._handleCombatKey('Digit3', { preventDefault() {} });
    expect(spy).not.toHaveBeenCalled();
  });

  it('does nothing while the spiral wipe is mid-transition', () => {
    const game = createEngine(Rpg);
    game._combat = makeCombat();
    game._phase = 'combat';
    game._transition = {
      start: 0,
      halfMs: 1000,
      midFn: () => {},
      midDone: false,
    };
    const spy = vi.spyOn(game, '_resolveCombatTurn');
    game._handleCombatKey('Enter', { preventDefault() {} });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('Rpg _onFoodEaten enemy bump', () => {
  it('falls back to dy=-2/+2 when both adjacent rows are blocked', () => {
    const game = createEngine(Rpg);
    game._started = true;
    // Open a wide playable corridor so dy=±2 has room.
    for (let c = game._worldX; c <= game._worldX + 3; c++) {
      game._caveRoof.set(c, 0);
      game._caveFloor.set(c, 0);
    }
    game._scrollerFood.push({ x: game._worldX + 1, y: game._snakeY });
    const nextX = game._worldX + 2;
    const target = {
      x: nextX,
      y: game._snakeY,
      hp: 8,
      maxHp: 8,
      attackMin: 2,
      attackMax: 4,
    };
    // Use stationary food pellets to block the dy=±1 rows: enemies
    // would otherwise step out of the way before the bump runs.
    game._scrollerFood.push({ x: nextX, y: game._snakeY - 1 });
    game._scrollerFood.push({ x: nextX, y: game._snakeY + 1 });
    game._enemies.push(target);
    game.update();
    // The pellet on the snake row was eaten; the dy=±1 pellets are
    // still in place because they're not on the head's cell.
    expect(game._scrollerFood.length).toBeGreaterThanOrEqual(2);
    expect(target.y).toBe(game._snakeY - 2);
  });

  it('leaves the enemy in place when all four bump rows are blocked', () => {
    const game = createEngine(Rpg);
    game._started = true;
    for (let c = game._worldX; c <= game._worldX + 3; c++) {
      game._caveRoof.set(c, 0);
      game._caveFloor.set(c, 0);
    }
    game._scrollerFood.push({ x: game._worldX + 1, y: game._snakeY });
    const nextX = game._worldX + 2;
    const target = {
      x: nextX,
      y: game._snakeY,
      hp: 8,
      maxHp: 8,
      attackMin: 2,
      attackMax: 4,
    };
    for (const dy of [-1, 1, -2, 2]) {
      game._scrollerFood.push({ x: nextX, y: game._snakeY + dy });
    }
    game._enemies.push(target);
    const startY = target.y;
    game.update();
    // No room to bump -> stays put.
    expect(target.y).toBe(startY);
  });
});

describe('Rpg _advanceTransition', () => {
  it('reports fill phase during the first half', () => {
    const game = createEngine(Rpg);
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    game._beginTransition({ midFn: vi.fn() });
    now = 1500; // half of the way through the fill (halfMs=1200)
    const s = game._advanceTransition(performance.now());
    expect(s).not.toBeNull();
    expect(s.unfilling).toBe(false);
    expect(s.progress).toBeGreaterThan(0);
    expect(s.progress).toBeLessThan(1);
  });

  it('fires midFn once when crossing the halfway point and reports unfill phase', () => {
    const game = createEngine(Rpg);
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const midFn = vi.fn();
    game._beginTransition({ midFn });
    // Second half (between halfMs and 2*halfMs).
    now = 1300; // 100ms into second half
    const s = game._advanceTransition(performance.now());
    expect(midFn).toHaveBeenCalledOnce();
    expect(s.unfilling).toBe(true);
  });

  it('fires midFn once at end and clears the transition when elapsed >= 2*halfMs', () => {
    const game = createEngine(Rpg);
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const midFn = vi.fn();
    game._beginTransition({ midFn });
    now = 5000; // well past 2 * 1200 = 2400
    const s = game._advanceTransition(performance.now());
    expect(midFn).toHaveBeenCalledOnce();
    expect(s).toBeNull();
    expect(game._transition).toBeNull();
  });

  it('does not double-call midFn when the transition is advanced past the end after the halfway crossing', () => {
    const game = createEngine(Rpg);
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const midFn = vi.fn();
    game._beginTransition({ midFn });
    now = 1300;
    game._advanceTransition(performance.now());
    now = 5000;
    game._advanceTransition(performance.now());
    expect(midFn).toHaveBeenCalledOnce();
  });

  it('returns null without throwing when no transition is active', () => {
    const game = createEngine(Rpg);
    expect(game._advanceTransition(0)).toBeNull();
  });
});

describe('Rpg combat normalization + floaters', () => {
  it('_normalizeCombat backfills missing animQueue and floaters on partial fixtures', () => {
    const game = createEngine(Rpg);
    const c = { enemy: { hp: 5, maxHp: 5, attackMin: 1, attackMax: 1 } };
    game._normalizeCombat(c);
    expect(Array.isArray(c.animQueue)).toBe(true);
    expect(Array.isArray(c.floaters)).toBe(true);
  });

  it("_pushFloater appends to the active combat's floater list", () => {
    const game = createEngine(Rpg);
    game._combat = makeCombat();
    game._pushFloater('enemy', '-3');
    expect(game._combat.floaters).toHaveLength(1);
    expect(game._combat.floaters[0]).toMatchObject({
      actor: 'enemy',
      text: '-3',
    });
  });

  it('_pushFloater is a no-op when there is no active combat', () => {
    const game = createEngine(Rpg);
    game._combat = null;
    expect(() => game._pushFloater('enemy', '-3')).not.toThrow();
  });
});

describe('Rpg combat selection snapping', () => {
  it("snaps c.selected from run to attack when the player's HP falls below the run threshold mid-turn", () => {
    const game = createEngine(Rpg);
    game._hp = 7; // above RUN_MIN_HP (6) initially
    game._combat = makeCombat({
      selected: 'run',
      // Big-attack enemy: enemy.attackMin=attackMax=7 so the counter-
      // swing drops the player to 0 below the run threshold but still
      // > 0 (the dying-branch returns before the snap).
      enemy: { hp: 99, maxHp: 99, attackMin: 6, attackMax: 6 },
    });
    game._phase = 'combat';
    // All rolls = 0 so player + enemy both swing for min, enemy picks
    // attack, no reflects.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    game._resolveCombatTurn('attack');
    expect(game._hp).toBeGreaterThan(0);
    expect(game._canRun()).toBe(false);
    expect(game._combat.selected).toBe('attack');
  });
});

describe('Rpg render render branches', () => {
  // Coverage for the scroll-phase render paths that draw cave, food,
  // enemies, snake segments, HP bar, score, and border at the same time.
  it('renders the scroll phase with cave + food + enemies + segments', () => {
    const game = createEngine(Rpg);
    // Populate visible food and enemies inside the camera window.
    game._scrollerFood.push({ x: game._worldX + 1, y: game._snakeY });
    game._scrollerFood.push({ x: game._worldX + 3, y: game._snakeY - 1 });
    game._enemies.push({
      x: game._worldX + 2,
      y: game._snakeY,
      hp: 5,
      maxHp: 8,
      attackMin: 2,
      attackMax: 4,
    });
    // Add tail segments so _drawSnake has more than just the head and
    // covers the left-edge cull branch.
    game._segments.push({ x: game._worldX - 1, y: game._snakeY });
    game._segments.push({ x: game._worldX - 5, y: game._snakeY }); // off-screen
    expect(() => game.render()).not.toThrow();
  });

  // Coverage for the combat render path including the live animation
  // queue (player + enemy lunges, counter brace, pause), the reflected
  // overlay branch, and the floating-damage drift.
  it('renders the combat phase with a live anim queue, reflected flag, and floaters', () => {
    const game = createEngine(Rpg);
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    game._phase = 'combat';
    game._combat = makeCombat({
      enemy: { hp: 6, maxHp: 10, attackMin: 2, attackMax: 4 },
      pendingPlayerDamage: 1,
      pendingEnemyDamage: 1,
      animQueue: [
        // Live attack with explicit startMs so _advanceCombatAnim skips
        // the onStart path and goes straight into the overlay branch.
        {
          actor: 'player',
          kind: 'attack',
          damage: 3,
          durationMs: 360,
          startMs: 900,
        },
      ],
      floaters: [
        {
          actor: 'enemy',
          text: '-3',
          jitter: 0.2,
          durationMs: 1500,
          startMs: 950,
        },
        {
          actor: 'player',
          text: '-2',
          jitter: -0.3,
          durationMs: 1500,
          startMs: 950,
        },
      ],
    });
    expect(() => game.render()).not.toThrow();

    // Advance into a reflected enemy-lunge to cover the reflected overlay
    // branch, then a counter brace to cover that kind, then a pause.
    game._combat.animQueue.push({
      actor: 'enemy',
      kind: 'attack',
      damage: 2,
      reflected: true,
      durationMs: 360,
      startMs: 950,
    });
    game._combat.animQueue.push({
      actor: 'player',
      kind: 'counter',
      durationMs: 320,
      startMs: 950,
    });
    game._combat.animQueue.push({
      actor: 'none',
      kind: 'pause',
      durationMs: 100,
      startMs: 950,
    });
    now = 1100; // partway through the head anim
    expect(() => game.render()).not.toThrow();
  });

  it('expires floaters once their lifetime elapses', () => {
    const game = createEngine(Rpg);
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    game._phase = 'combat';
    game._combat = makeCombat({
      floaters: [
        {
          actor: 'player',
          text: '-1',
          jitter: 0,
          durationMs: 1500,
          startMs: 0,
        },
      ],
    });
    // Render once so the floater's startMs binds, then skip past its
    // lifetime so the next render trims it.
    game.render();
    now = 2000;
    game.render();
    expect(game._combat.floaters).toHaveLength(0);
  });

  it('renders the spiral overlay during both halves of the transition without throwing', () => {
    const game = createEngine(Rpg);
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    game._beginTransition({ midFn: () => {} });
    // First half -- fill in from the center.
    now = 600;
    expect(() => game.render()).not.toThrow();
    // Second half -- unfill outward (same order).
    now = 1800;
    expect(() => game.render()).not.toThrow();
  });

  it('renders the combat phase under an active transition (sprite/menu still drawn)', () => {
    const game = createEngine(Rpg);
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    game._phase = 'combat';
    game._combat = makeCombat();
    game._beginTransition({ midFn: () => {} });
    now = 600;
    expect(() => game.render()).not.toThrow();
  });

  it('renders the game-over banner when the player has died', () => {
    const game = createEngine(Rpg);
    game.gameOver = true;
    expect(() => game.render()).not.toThrow();
  });

  it('renders the combat menu with run greyed out when HP is below the threshold', () => {
    const game = createEngine(Rpg);
    game._hp = 2; // _canRun() -> false
    game._phase = 'combat';
    game._combat = makeCombat();
    expect(() => game.render()).not.toThrow();
  });
});

describe('Rpg combat anim onStart / onComplete', () => {
  it('fires onStart on the first frame an anim becomes the head', () => {
    const game = createEngine(Rpg);
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const onStart = vi.fn();
    game._phase = 'combat';
    game._combat = makeCombat({
      animQueue: [
        { actor: 'player', kind: 'attack', durationMs: 100, onStart },
      ],
    });
    game.render();
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('fires onComplete and advances past finished anims', () => {
    const game = createEngine(Rpg);
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const onComplete = vi.fn();
    game._phase = 'combat';
    game._combat = makeCombat({
      animQueue: [
        {
          actor: 'player',
          kind: 'attack',
          durationMs: 100,
          startMs: 800,
          onComplete,
        },
        { actor: 'enemy', kind: 'attack', durationMs: 100 },
      ],
    });
    game.render();
    expect(onComplete).toHaveBeenCalledOnce();
    expect(game._combat.animQueue[0].actor).toBe('enemy');
  });
});
