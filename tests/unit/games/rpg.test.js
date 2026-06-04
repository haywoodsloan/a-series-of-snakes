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

  it('advances the snake forward one column per tick', () => {
    const game = createEngine(Rpg);
    game._started = true;
    const startX = game._worldX;
    game.update();
    expect(game._worldX).toBe(startX + 1);
    game.update();
    expect(game._worldX).toBe(startX + 2);
  });

  it('increments score per food eaten, not per tick', () => {
    const game = createEngine(Rpg);
    game._started = true;
    expect(game.score).toBe(0);
    // Two empty ticks must not move the score -- score is no longer
    // tied to forward distance.
    game.update();
    game.update();
    expect(game.score).toBe(0);
    // Park a pellet on the next cell so the next tick is a pickup.
    game._scrollerFood.push({ x: game._worldX + 1, y: game._snakeY });
    game.update();
    expect(game.score).toBe(1);
    game._scrollerFood.push({ x: game._worldX + 1, y: game._snakeY });
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

  it('a pellet eaten at low HP fully restores HP including the new bonus point', () => {
    // Pellets are a strict reward: they should always top the snake
    // back off to the just-bumped max, even when the player walks in
    // missing most of their HP. The partial heal of the old design
    // could leave the snake at, say, 6/21 after a pickup -- this
    // covers the "full refill" guarantee that replaces it.
    const game = createEngine(Rpg);
    game._started = true;
    game._hp = 1;
    const startMaxHp = game._maxHp;
    game._scrollerFood.push({ x: game._worldX + 1, y: game._snakeY });
    game.update();
    expect(game._maxHp).toBe(startMaxHp + 1);
    expect(game._hp).toBe(game._maxHp);
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
    // turn): enemy-attack-chance (0 -> attack), enemy hit roll
    // (0 -> hits, < HIT_CHANCE), enemy damage randInt (0 -> min),
    // reflect roll (0.99 -> fails). Damage hits the player at full
    // strength like a regular attack would.
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
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
    // Sequence: player hit roll (0 -> hits), player damage randInt
    // (0 -> 3), reflect roll (0.99 -> fails), enemy attack chance
    // (0 -> attack), enemy hit roll (0 -> hits), enemy damage (0 -> 0
    // harmless). Player damage lands on the enemy as usual.
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
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

  it('keeps chasing on Y but stops chasing on X once an enemy has slid behind the snake', () => {
    const game = createEngine(Rpg);
    game._snakeY = 5;
    // Enemy starts three columns behind the snake (dx > 0) on a
    // different row. Freezing the AI entirely looked unnatural (the
    // enemy just sits on screen and rides the scroll off), but
    // chasing on X would let a behind-enemy out-pace the world
    // scroll (ENEMY_SPEED > 1) and clamp itself to the snake's
    // column indefinitely. The compromise: keep Y-chasing so the
    // enemy looks alive (still turning toward the snake), but skip
    // X-chasing so the world-scroll actually carries it off the
    // left edge.
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
    // X is unchanged (behind-enemy can't chase X) but Y still steps
    // toward the snake.
    expect(e.x).toBe(ex);
    expect(e.y).toBe(ey + 1);
  });

  it('lets a behind-enemy ride the scroll off the left edge instead of clamping to the snake column', () => {
    // Concretely walk a few snake ticks worth of world-scroll +
    // enemy steps and verify the enemy's screen position drifts
    // monotonically left -- the original "freeze when behind" did
    // this naturally but looked dead, and the unconditional chase
    // had ENEMY_SPEED out-pacing the scroll so the enemy locked to
    // the snake's column forever. This regression test catches both
    // failure modes.
    const game = createEngine(Rpg);
    game._snakeY = 5;
    const ex = game._worldX - 2;
    const ey = game._snakeY; // Same row, no Y chase to confound things.
    for (let c = ex - 5; c <= game._worldX + 5; c++) {
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
    const screenX = (e) => e.x - (game._worldX - game._snakeCol);
    const initial = screenX(game._enemies[0]);
    // Simulate three snake ticks of scroll without re-spawning. Each
    // tick: world advances 1, enemies (behind, same row) don't step
    // X. Screen X must drop by 1 per tick.
    for (let i = 0; i < 3; i++) {
      game._worldX += 1;
      game._stepEnemies();
    }
    expect(screenX(game._enemies[0])).toBe(initial - 3);
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

describe('Rpg hit / miss', () => {
  it('a missed player attack does no damage and queues a MISS floater over the enemy', () => {
    const game = createEngine(Rpg);
    game._combat = makeCombat({
      enemy: { hp: 20, maxHp: 20, attackMin: 0, attackMax: 0 },
    });
    game._phase = 'combat';
    // 0.99 fails the < HIT_CHANCE check -> player whiffs.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    game._resolveCombatTurn('attack');
    expect(game._combat.enemy.hp).toBe(20);
    const playerLunge = game._combat.animQueue.find(
      (a) => a.actor === 'player' && a.kind === 'attack'
    );
    expect(playerLunge).toBeDefined();
    expect(playerLunge.missed).toBe(true);
    // MISS floats over the target (the enemy) so it lines up with
    // damage numbers on hits -- both appear over the actor whose
    // hitbox the swing was aimed at.
    const miss = game._combat.floaters.find(
      (f) => f.actor === 'enemy' && f.text === 'MISS'
    );
    expect(miss).toBeDefined();
    // And nothing whiff-related lands on the attacker.
    expect(
      game._combat.floaters.some(
        (f) => f.actor === 'player' && f.text === 'MISS'
      )
    ).toBe(false);
  });

  it('a missed player attack still wastes a primed enemy counter (no reflect on a whiff)', () => {
    const game = createEngine(Rpg);
    const startHp = game._hp;
    game._combat = makeCombat({
      enemy: { hp: 50, maxHp: 50, attackMin: 0, attackMax: 0 },
      enemyCountering: true,
    });
    game._phase = 'combat';
    // Player misses (hit roll > HIT_CHANCE). Reflect should never
    // fire because there's no damage to bounce.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    game._resolveCombatTurn('attack');
    // Neither side loses HP -- a miss + counter is a wash.
    expect(game._hp).toBe(startHp);
    expect(game._combat.enemy.hp).toBe(50);
  });

  it('a missed enemy attack does no damage to the player and flags the lunge as a whiff with a deferred MISS floater on the player', () => {
    const game = createEngine(Rpg);
    const startHp = game._hp;
    game._combat = makeCombat({
      enemy: { hp: 50, maxHp: 50, attackMin: 10, attackMax: 10 },
    });
    game._phase = 'combat';
    // Sequence: player picks counter (no rolls), enemy attack chance
    // (0 -> attack), enemy hit roll (0.99 -> miss). No damage roll
    // because the miss short-circuits before the damage branch.
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99)
      .mockReturnValue(0);
    game._resolveCombatTurn('counter');
    expect(game._hp).toBe(startHp);
    const enemyLunge = game._combat.animQueue.find(
      (a) => a.actor === 'enemy' && a.kind === 'attack'
    );
    expect(enemyLunge).toBeDefined();
    expect(enemyLunge.missed).toBe(true);
    // The MISS floater is deferred (onStart) so the text pops on
    // contact rather than the instant resolve runs. Fire it manually
    // and confirm the floater lands on the player (the target of
    // the enemy's whiff), not on the enemy.
    expect(enemyLunge.onStart).toBeTypeOf('function');
    enemyLunge.onStart();
    const miss = game._combat.floaters.find((f) => f.text === 'MISS');
    expect(miss).toBeDefined();
    expect(miss.actor).toBe('player');
  });

  it('a successful hit roll still uses the damage range (so the hit roll does not silently consume the damage roll)', () => {
    const game = createEngine(Rpg);
    game._combat = makeCombat({
      enemy: { hp: 50, maxHp: 50, attackMin: 0, attackMax: 0 },
    });
    game._phase = 'combat';
    // All rolls = 0: hit succeeds, damage lands at min. Guards
    // against an accidental refactor where the hit branch and the
    // damage branch share the same roll.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    game._resolveCombatTurn('attack');
    expect(game._combat.enemy.hp).toBeLessThan(50);
  });
});

describe('Rpg player scaling', () => {
  it('player attack range grows with food eaten', () => {
    const game = createEngine(Rpg);
    const base = game._scaledPlayerStats();
    game._foodEaten = 5;
    const ramped = game._scaledPlayerStats();
    expect(ramped.attackMax).toBeGreaterThan(base.attackMax);
    expect(ramped.attackMin).toBeGreaterThanOrEqual(base.attackMin);
  });

  it('a late-game player attack deals more damage than an early-game one with the same dice', () => {
    // Pin every damage roll to land exactly at min for both runs so
    // any delta between the two outcomes is the food ramp itself,
    // not noise from the randInt range.
    const earlyGame = createEngine(Rpg);
    earlyGame._combat = makeCombat({
      enemy: { hp: 200, maxHp: 200, attackMin: 0, attackMax: 0 },
    });
    earlyGame._phase = 'combat';
    vi.spyOn(Math, 'random').mockReturnValue(0);
    earlyGame._resolveCombatTurn('attack');
    const earlyDamage = 200 - earlyGame._combat.enemy.hp;

    vi.restoreAllMocks();
    const lateGame = createEngine(Rpg);
    lateGame._foodEaten = 10;
    lateGame._combat = makeCombat({
      enemy: { hp: 200, maxHp: 200, attackMin: 0, attackMax: 0 },
    });
    lateGame._phase = 'combat';
    vi.spyOn(Math, 'random').mockReturnValue(0);
    lateGame._resolveCombatTurn('attack');
    const lateDamage = 200 - lateGame._combat.enemy.hp;

    expect(lateDamage).toBeGreaterThan(earlyDamage);
  });
});

describe('Rpg spiral wipe duration', () => {
  it('completes in exactly 2 * halfMs of wall-clock time regardless of how many render frames fire in between', () => {
    // The wipe is driven by `performance.now()` (not tick rate or
    // speed multiplier), so the total duration is the simple sum of
    // its two halves. This regression test pins that contract: no
    // matter how many or how few frames the engine renders during
    // the wipe, the transition completes exactly when wall-clock
    // elapsed reaches 2 * halfMs.
    const game = createEngine(Rpg);
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const midFn = vi.fn();
    game._beginTransition({ midFn });
    const halfMs = game._transition.halfMs;
    // One render frame just before the swap -- still in the fill
    // half, midFn must not have fired yet.
    now = halfMs - 1;
    game.render();
    expect(midFn).not.toHaveBeenCalled();
    expect(game._transition).not.toBeNull();
    // One render frame just after the swap -- midFn fires exactly
    // once, transition stays live for the unfill half.
    now = halfMs + 1;
    game.render();
    expect(midFn).toHaveBeenCalledOnce();
    expect(game._transition).not.toBeNull();
    // One render frame just before the end -- still alive.
    now = 2 * halfMs - 1;
    game.render();
    expect(game._transition).not.toBeNull();
    // One render frame just past the end -- transition cleared.
    now = 2 * halfMs + 1;
    game.render();
    expect(game._transition).toBeNull();
  });

  it('produces a similar spiral cell count across grid sizes (consistent visual cadence)', () => {
    // Anchoring the spiral cell size to the playfield (not the play
    // grid) keeps the wipe's visible step count roughly constant
    // regardless of grid density -- so a sparse grid and a dense
    // grid both show the same number of square pops over the same
    // 2.4s window. Without this fix, dense grids ran a 20x20+
    // spiral against a sparse grid's 8x8 and the wipe felt visibly
    // faster on the dense one. The two engines below share the
    // test harness's canvas so the only delta is the play grid.
    const small = createEngine(Rpg, { cols: 12, rows: 12 });
    const large = createEngine(Rpg, { cols: 40, rows: 40 });
    expect(small.canvas.width).toBe(large.canvas.width);
    expect(small.canvas.height).toBe(large.canvas.height);
    const cellCount = (g) => {
      const layout = g._gridLayout();
      const fieldW = layout.cell * g.cols;
      const fieldH = layout.cell * g.rows;
      // Mirror the calculation inside `_drawSpiralOverlay`.
      const cell = Math.max(8, Math.round(Math.min(fieldW, fieldH) / 14));
      const cols = Math.ceil(fieldW / cell);
      const rows = Math.ceil(fieldH / cell);
      return cols * rows;
    };
    // The two counts should now be within a small factor of each
    // other (under the old `layout.cell * 2` rule they differed by
    // ~10x). A ratio band of [0.5, 2] is comfortably tighter than
    // that and leaves room for layout border rounding.
    const ratio = cellCount(large) / cellCount(small);
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2);
  });
});

describe('Rpg combat layout', () => {
  // HP-panel geometry is opposite-side mounted: player sprite on the
  // left has its bar on the *far right* of the playfield, enemy
  // sprite on the right has its bar on the *far left*. Bars are
  // vertically centered on each sprite's midline. Bar width is
  // floored at the longest worst-case label so the label always
  // fits inside the bar.
  it('keeps the enemy sprite + HP panel inside the playfield', () => {
    const game = createEngine(Rpg);
    game._combat = makeCombat({
      // Long max HP -> wide "ENEMY 999/999" label drives the bar
      // width up.
      enemy: { hp: 999, maxHp: 999, attackMin: 0, attackMax: 0 },
    });
    game._phase = 'combat';
    const layout = game._gridLayout();
    const w = layout.cell * game.cols;
    const leftEdge = layout.ox;
    const rightEdge = layout.ox + w;
    const geom = game._combatSpriteGeom(layout);
    // Sprite's right edge stays inside the playfield.
    expect(geom.enemyCenterX + geom.spriteSize / 2).toBeLessThanOrEqual(
      rightEdge
    );
    // The enemy bar lives on the *opposite* (left) side, so its
    // left edge must also stay inside the playfield.
    expect(geom.enemyBarX).toBeGreaterThanOrEqual(leftEdge);
    // And the player bar (far right) must not spill past the right
    // edge either.
    expect(geom.playerBarX + geom.barW).toBeLessThanOrEqual(rightEdge);
  });

  it('places the player HP panel on the opposite side of the player sprite', () => {
    const game = createEngine(Rpg);
    game._combat = makeCombat();
    game._phase = 'combat';
    const layout = game._gridLayout();
    const geom = game._combatSpriteGeom(layout);
    // Player bar's left edge must clear the sprite's right edge --
    // it's across the sprite, not overlapping it.
    expect(geom.playerBarX).toBeGreaterThan(
      geom.playerCenterX + geom.spriteSize / 2
    );
  });

  it('places the enemy HP panel on the opposite side of the enemy sprite', () => {
    const game = createEngine(Rpg);
    game._combat = makeCombat();
    game._phase = 'combat';
    const layout = game._gridLayout();
    const geom = game._combatSpriteGeom(layout);
    // Enemy bar's right edge must clear the sprite's left edge.
    expect(geom.enemyBarX + geom.barW).toBeLessThan(
      geom.enemyCenterX - geom.spriteSize / 2
    );
  });

  it('pulls each HP panel inboard from the playfield edge so it pairs with its sprite', () => {
    const game = createEngine(Rpg);
    game._combat = makeCombat();
    game._phase = 'combat';
    const layout = game._gridLayout();
    const w = layout.cell * game.cols;
    const pad = Math.max(4, Math.round(layout.cell * 0.25));
    const geom = game._combatSpriteGeom(layout);
    // Inset from each playfield edge must exceed the trivial
    // `pad * 2` baseline -- otherwise the bars are hugging the wall
    // and feel detached from their sprites.
    const playerRightInset = layout.ox + w - (geom.playerBarX + geom.barW);
    const enemyLeftInset = geom.enemyBarX - layout.ox;
    expect(playerRightInset).toBeGreaterThan(pad * 2);
    expect(enemyLeftInset).toBeGreaterThan(pad * 2);
  });

  it('grows the bar width to fit the longest label so the text does not spill onto the sprite', () => {
    const tiny = createEngine(Rpg);
    tiny._combat = makeCombat({
      enemy: { hp: 1, maxHp: 1, attackMin: 0, attackMax: 0 },
    });
    tiny._phase = 'combat';
    const tinyGeom = tiny._combatSpriteGeom(tiny._gridLayout());

    const huge = createEngine(Rpg);
    huge._combat = makeCombat({
      enemy: { hp: 999, maxHp: 999, attackMin: 0, attackMax: 0 },
    });
    huge._phase = 'combat';
    const hugeGeom = huge._combatSpriteGeom(huge._gridLayout());

    // The longer label drives the floor on barW up; the shorter
    // label leaves the cap (targetBarW) in charge. So huge should
    // be at least as wide as tiny, and strictly wider when the
    // label actually exceeds the cap.
    expect(hugeGeom.barW).toBeGreaterThanOrEqual(tinyGeom.barW);

    // Confirm the longest enemy label fits inside huge's bar -- the
    // whole point of the floor. Font formula must match
    // _combatSpriteGeom / _drawCombatHpBar so the measured width
    // reflects what actually gets drawn.
    const layout = huge._gridLayout();
    const labelFontPx = Math.max(22, Math.round(layout.cell * 1.05));
    huge.ctx.font = `${labelFontPx}px PublicPixel, monospace`;
    const enemyLabelW = huge.ctx.measureText('ENEMY 999/999').width;
    expect(hugeGeom.barW).toBeGreaterThanOrEqual(enemyLabelW);
  });
});
