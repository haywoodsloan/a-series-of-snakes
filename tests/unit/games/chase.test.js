import { describe, expect, it, vi } from 'vitest';
import Chase from '~/games/chase.js';

import {
  createEngine,
  dispatchKey,
  setupEngineTest,
  withFakeTimers,
} from '../../helpers/engine.js';

setupEngineTest();

describe('Chase', () => {
  it('food moves on _stepFood when a legal move exists', () => {
    const game = createEngine(Chase);
    game.snakes[0].segments = [{ x: 5, y: 5 }];
    game.food.length = 0;
    game.addFood({ x: 6, y: 5 });

    game._stepFood();
    // A pellet cannot voluntarily stay still when a legal move exists.
    expect(game.food[0]).not.toMatchObject({ x: 6, y: 5 });
  });

  it('takes the only legal escape when 3 neighbors are blocked', () => {
    const game = createEngine(Chase);
    // Snake walls off three sides of (5, 5) leaving only "up" open.
    game.snakes[0].segments = [
      { x: 6, y: 5 },
      { x: 4, y: 5 },
      { x: 5, y: 6 },
    ];
    game.food.length = 0;
    game.addFood({ x: 5, y: 5 });

    game._stepFood();
    expect(game.food[0]).toMatchObject({ x: 5, y: 4 });
  });

  it('_scheduleFoodTimer + _clearFoodTimer toggle the interval id', () => {
    withFakeTimers(() => {
      const game = createEngine(Chase);
      expect(game._foodTimer).toBe(0);

      game._scheduleFoodTimer();
      expect(game._foodTimer).not.toBe(0);

      game._clearFoodTimer();
      expect(game._foodTimer).toBe(0);
    });
  });

  it('setTickRate reschedules the food timer once started', () => {
    withFakeTimers(() => {
      const game = createEngine(Chase);
      game._started = true;
      game._scheduleFoodTimer();
      const first = game._foodTimer;

      game.setTickRate(game.tickRate * 2);
      expect(game._foodTimer).not.toBe(0);
      expect(game._foodTimer).not.toBe(first);
    });
  });

  it('setTickRate does not schedule a timer while idle', () => {
    const game = createEngine(Chase);
    expect(game._foodTimer).toBe(0);
    game.setTickRate(game.tickRate * 2);
    expect(game._foodTimer).toBe(0);
  });

  it('stop() and destroy() clear the food timer', () => {
    const game = createEngine(Chase);
    game._started = true;
    game._scheduleFoodTimer();
    expect(game._foodTimer).not.toBe(0);
    game.stop();
    expect(game._foodTimer).toBe(0);

    // destroy() is also a clearing path -- restart and tear down again.
    game._scheduleFoodTimer();
    expect(game._foodTimer).not.toBe(0);
    game.destroy();
    expect(game._foodTimer).toBe(0);
  });

  it('food-timer tick steps the pellet and marks the canvas dirty', () => {
    withFakeTimers(() => {
      const game = createEngine(Chase);
      game.snakes[0].segments = [{ x: 5, y: 5 }];
      game.food.length = 0;
      game.addFood({ x: 6, y: 5 });
      game._dirty = false;
      game._started = true;
      game._scheduleFoodTimer();

      vi.advanceTimersByTime(10_000);
      expect(game._dirty).toBe(true);
      expect(game.food[0]).not.toMatchObject({ x: 6, y: 5 });
    });
  });

  it('food-timer tick is a no-op after game over', () => {
    withFakeTimers(() => {
      const game = createEngine(Chase);
      game.snakes[0].segments = [{ x: 5, y: 5 }];
      game.food.length = 0;
      game.addFood({ x: 6, y: 5 });
      game._started = true;
      game.gameOver = true;
      game._scheduleFoodTimer();
      game._dirty = false;

      vi.advanceTimersByTime(10_000);
      // Pellet unmoved; the timer callback bails on gameOver before
      // calling _stepFood.
      expect(game.food[0]).toMatchObject({ x: 6, y: 5 });
      expect(game._dirty).toBe(false);
    });
  });

  it('_stepFood falls back through the no-reverse rule when no forward move is legal', () => {
    const game = createEngine(Chase);
    // Head at (5,5); pellet at (3,5) with _dir=0 (last moved right) so
    // the reverse direction (left, i=1) is forbidden on the first pass.
    // The three non-reverse neighbors are blocked by snake segments,
    // forcing the fallback loop to relax the no-reverse rule and pick
    // left -> (2,5).
    game.snakes[0].segments = [
      { x: 5, y: 5 },
      { x: 4, y: 5 }, // blocks i=0 (right -> (4,5))
      { x: 3, y: 6 }, // blocks i=2 (down  -> (3,6))
      { x: 3, y: 4 }, // blocks i=3 (up    -> (3,4))
    ];
    game.food.length = 0;
    game.addFood({ x: 3, y: 5 });
    game.food[0]._dir = 0;

    game._stepFood();
    expect(game.food[0]).toMatchObject({ x: 2, y: 5, _dir: 1 });
  });

  it('_stepFood leaves a fully cornered pellet in place', () => {
    const game = createEngine(Chase);
    // Surround (3,5) on all four sides with snake body so no move is
    // legal even in the fallback pass.
    game.snakes[0].segments = [
      { x: 5, y: 5 },
      { x: 4, y: 5 }, // right
      { x: 2, y: 5 }, // left
      { x: 3, y: 6 }, // down
      { x: 3, y: 4 }, // up
    ];
    game.food.length = 0;
    game.addFood({ x: 3, y: 5 });

    game._stepFood();
    expect(game.food[0]).toMatchObject({ x: 3, y: 5 });
  });

  it('first input flips _started and schedules the food timer', () => {
    const game = createEngine(Chase);
    game.start();
    expect(game._started).toBe(false);
    expect(game._foodTimer).toBe(0);
    dispatchKey('ArrowRight');
    expect(game._started).toBe(true);
    expect(game._foodTimer).not.toBe(0);
    game.stop();
  });
});
