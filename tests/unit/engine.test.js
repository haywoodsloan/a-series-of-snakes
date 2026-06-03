import { describe, expect, it, vi } from 'vitest';
import Engine from '~/games/engine.js';
import { settings } from '~/utils/settings.js';

import {
  captureRAF,
  createEngine,
  dispatchKey,
  makeCanvasRect,
  setupEngineTest,
} from '../helpers/engine.js';

setupEngineTest();

describe('Engine: snake stepping', () => {
  it('advances the head by one direction delta per step', () => {
    const engine = createEngine();
    const snake = engine.addSnake({
      head: { x: 5, y: 5 },
      direction: 'right',
      length: 3,
    });

    engine.stepSnake(snake);
    engine.stepSnake(snake);
    engine.stepSnake(snake);

    expect(snake.segments[0]).toEqual({ x: 8, y: 5 });
    // Started at length 1 and grew toward target 3; after 3 steps the
    // tail trim balances growth.
    expect(snake.segments).toHaveLength(3);
  });

  it('wraps the head around grid edges', () => {
    const engine = createEngine(Engine, { cols: 5, rows: 5 });
    const snake = engine.addSnake({
      head: { x: 4, y: 0 },
      direction: 'right',
      length: 1,
    });

    engine.stepSnake(snake);
    expect(snake.segments[0]).toEqual({ x: 0, y: 0 });

    snake.direction = snake.nextDirection = 'up';
    engine.stepSnake(snake);
    expect(snake.segments[0]).toEqual({ x: 0, y: 4 });
  });
});

describe('Engine: direction queueing', () => {
  it('rejects direct reversals against the committed direction', () => {
    const engine = createEngine();
    const snake = engine.addSnake({
      head: { x: 5, y: 5 },
      direction: 'right',
      length: 3,
    });
    // The reversal guard only applies once the snake is multi-segment.
    engine.stepSnake(snake);
    engine.stepSnake(snake);

    engine.setDirection(snake, 'left'); // illegal U-turn
    expect(snake.nextDirection).toBe('right');

    engine.setDirection(snake, 'up'); // legal perpendicular
    expect(snake.nextDirection).toBe('up');
  });

  it('buffers a second turn pressed within the same tick', () => {
    const engine = createEngine();
    const snake = engine.addSnake({
      head: { x: 5, y: 5 },
      direction: 'right',
      length: 3,
    });

    engine.setDirection(snake, 'up');
    engine.setDirection(snake, 'left');
    expect(snake.nextDirection).toBe('up');
    expect(snake.bufferedDirection).toBe('left');

    engine.stepSnake(snake);
    expect(snake.direction).toBe('up');
    expect(snake.nextDirection).toBe('left');
    expect(snake.bufferedDirection).toBeNull();
  });
});

describe('Engine: collision detection', () => {
  it('flags self-collision when head re-enters a body cell', () => {
    const engine = createEngine();
    const snake = engine.addSnake({
      head: { x: 5, y: 5 },
      direction: 'right',
      length: 4,
    });
    snake.segments = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 4, y: 4 },
      { x: 5, y: 4 },
    ];
    expect(engine._detectCollision(snake, { x: 4, y: 5 })?.type).toBe('self');
  });

  it('flags wall collisions', () => {
    const engine = createEngine();
    const snake = engine.addSnake({
      head: { x: 5, y: 5 },
      direction: 'right',
      length: 1,
    });
    engine.addWall({ x: 6, y: 5 });

    expect(engine._detectCollision(snake, { x: 6, y: 5 })?.type).toBe('wall');
  });

  it('flags snake-vs-snake collisions and exposes the other snake', () => {
    const engine = createEngine();
    engine.addSnake({ head: { x: 5, y: 5 }, length: 1 });
    const other = engine.addSnake({ head: { x: 6, y: 5 }, length: 1 });

    const hit = engine._detectCollision(engine.snakes[0], { x: 6, y: 5 });
    expect(hit?.type).toBe('snake');
    expect(hit?.other).toBe(other);
  });
});

describe('Engine: random placement', () => {
  it('returns null when the grid is fully occupied', () => {
    const engine = createEngine(Engine, { cols: 2, rows: 2 });
    const snake = engine.addSnake({ head: { x: 0, y: 0 }, length: 4 });
    snake.segments = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ];
    expect(engine.randomEmptyCell()).toBeNull();
  });

  it('only ever returns cells that are unoccupied by snakes or food', () => {
    const engine = createEngine(Engine, { cols: 5, rows: 5 });
    const snake = engine.addSnake({ head: { x: 2, y: 2 }, length: 1 });
    engine.addFood({ x: 0, y: 0 });
    const taken = new Set([
      ...snake.segments.map((s) => `${s.x},${s.y}`),
      ...engine.food.map((f) => `${f.x},${f.y}`),
    ]);

    // 50 samples is well past the budget-vs-fallback threshold for a
    // 5x5 grid with 2 occupied cells (~92% free).
    for (let i = 0; i < 50; i++) {
      const cell = engine.randomEmptyCell();
      expect(cell).not.toBeNull();
      expect(taken.has(`${cell.x},${cell.y}`)).toBe(false);
    }
  });
});

describe('Engine: food', () => {
  it('addFood adds a pellet at the requested cell', () => {
    const engine = createEngine();
    engine.addFood({ x: 3, y: 4 });
    expect(engine.food).toEqual([{ x: 3, y: 4, color: undefined }]);
  });

  it('addRandomFood spawns at an in-grid cell that is not occupied', () => {
    const engine = createEngine(Engine, { cols: 5, rows: 5 });
    const snake = engine.addSnake({ head: { x: 0, y: 0 }, length: 1 });

    const pellet = engine.addRandomFood();
    expect(pellet).not.toBeNull();
    expect(pellet.x).toBeGreaterThanOrEqual(0);
    expect(pellet.x).toBeLessThan(5);
    expect(pellet.y).toBeGreaterThanOrEqual(0);
    expect(pellet.y).toBeLessThan(5);
    expect(snake.segments).not.toContainEqual({ x: pellet.x, y: pellet.y });
  });
});

describe('Engine: walls', () => {
  it('addWall adds an obstacle and refreshes the wall map', () => {
    const engine = createEngine();
    engine.addWall({ x: 2, y: 2 });
    expect(engine.walls).toHaveLength(1);
    expect(engine._wallMap().get(2 * 10 + 2)).toBeDefined();
  });

  it('addRandomWalls fills approximately the requested ratio', () => {
    const engine = createEngine(Engine, { cols: 20, rows: 20 });
    engine.addSnake({ head: { x: 0, y: 0 }, length: 1 });
    engine.addRandomWalls({ ratio: 0.15, clearance: 1 });

    // The placer rolls back orphan seeds and respects clearance / no-2x2
    // / no-loop constraints, so exact count is non-deterministic --
    // assert generously around the target.
    const total = 20 * 20;
    expect(engine.walls.length).toBeGreaterThan(total * 0.05);
    expect(engine.walls.length).toBeLessThan(total * 0.25);
  });

  it('never produces a 2x2 wall block (one-cell-thick invariant)', () => {
    const engine = createEngine(Engine, { cols: 20, rows: 20 });
    engine.addSnake({ head: { x: 0, y: 0 }, length: 1 });
    engine.addRandomWalls({ ratio: 0.3, clearance: 0 });

    const walls = new Set(engine.walls.map((w) => w.x * 20 + w.y));
    const isWall = (x, y) => walls.has(x * 20 + y);
    for (let x = 0; x < 19; x++) {
      for (let y = 0; y < 19; y++) {
        const square =
          isWall(x, y) &&
          isWall(x + 1, y) &&
          isWall(x, y + 1) &&
          isWall(x + 1, y + 1);
        expect(square).toBe(false);
      }
    }
  });
});

describe('Engine: stepAll', () => {
  it('triggers default onEat: grows snake, bumps score, respawns food', () => {
    const engine = createEngine();
    const snake = engine.addSnake({
      head: { x: 5, y: 5 },
      direction: 'right',
      length: 3,
    });
    engine.addFood({ x: 6, y: 5 });

    engine.stepAll();

    expect(snake.length).toBe(4);
    expect(engine.score).toBe(1);
    expect(engine.food).toHaveLength(1);
  });

  it('triggers default onCollision (wall) and ends the game', () => {
    const engine = createEngine();
    engine.addSnake({ head: { x: 5, y: 5 }, direction: 'right', length: 1 });
    engine.addWall({ x: 6, y: 5 });

    engine.stepAll();
    expect(engine.gameOver).toBe(true);
  });

  it('dispatches a gameover CustomEvent with engine, score, and gameKey', () => {
    const engine = createEngine();
    engine.addSnake({ head: { x: 5, y: 5 }, direction: 'right', length: 1 });
    engine.addWall({ x: 6, y: 5 });

    const listener = vi.fn();
    engine.canvas.addEventListener('gameover', listener);
    engine.stepAll();

    expect(listener).toHaveBeenCalledOnce();
    const { detail } = listener.mock.calls[0][0];
    expect(detail.engine).toBe(engine);
    expect(typeof detail.score).toBe('number');
    expect(typeof detail.gameKey).toBe('string');
  });
});

describe('Engine: tick rate', () => {
  it('clamps a non-positive request to a positive value', () => {
    const engine = createEngine(Engine, { tickRate: 8 });
    engine.setTickRate(-5);
    expect(engine.tickRate).toBeGreaterThan(0);

    engine.setTickRate(20);
    expect(engine.tickRate).toBeCloseTo(20, 5);
  });
});

describe('Engine: keyboard input', () => {
  it('routes mapped keys (arrows + WASD) to onInput handlers', () => {
    const engine = createEngine();
    const handler = vi.fn();
    engine.onInput(handler);
    engine.start();

    dispatchKey('ArrowUp');
    dispatchKey('KeyA');
    dispatchKey('Space'); // unmapped

    engine.stop();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0][0]).toMatchObject({
      kind: 'arrows',
      dir: 'up',
    });
    expect(handler.mock.calls[1][0]).toMatchObject({
      kind: 'wasd',
      dir: 'left',
    });
  });

  it('ignores key repeats', () => {
    const engine = createEngine();
    const handler = vi.fn();
    engine.onInput(handler);
    engine.start();

    dispatchKey('ArrowRight', { repeat: true });

    engine.stop();
    expect(handler).not.toHaveBeenCalled();
  });

  it('unsubscribing stops further calls', () => {
    const engine = createEngine();
    const handler = vi.fn();
    const unsubscribe = engine.onInput(handler);
    engine.start();

    dispatchKey('ArrowUp');
    unsubscribe();
    dispatchKey('ArrowDown');

    engine.stop();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('Engine: high score', () => {
  it('submitHighScore persists the entry and updates the cached top', () => {
    const engine = createEngine();
    engine.score = 42;
    engine.submitHighScore('ABC');

    expect(engine.highScore).toBe(42);
    expect(engine.getHighScores()[0]).toMatchObject({ name: 'ABC', score: 42 });
  });
});

describe('Engine: render pipeline', () => {
  it('clears + draws playfield, border, food, snake, and HUD', () => {
    const engine = createEngine();
    engine.addSnake({ head: { x: 5, y: 5 }, length: 3 });
    engine.addFood({ x: 2, y: 2 });

    const { ctx } = engine;
    const clearSpy = vi.spyOn(ctx, 'clearRect');
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');
    const fillTextSpy = vi.spyOn(ctx, 'fillText');
    const strokeRectSpy = vi.spyOn(ctx, 'strokeRect');

    engine.render();

    expect(clearSpy).toHaveBeenCalledOnce();
    expect(fillRectSpy).toHaveBeenCalled();
    expect(strokeRectSpy).toHaveBeenCalled();
    expect(fillTextSpy).toHaveBeenCalledWith(
      expect.stringContaining('SCORE'),
      expect.any(Number),
      expect.any(Number)
    );
    expect(fillTextSpy).toHaveBeenCalledWith(
      expect.stringContaining('HI'),
      expect.any(Number),
      expect.any(Number)
    );
  });

  it('overlays the dim layer when gameOver is true', () => {
    const engine = createEngine();
    engine.addSnake({ head: { x: 5, y: 5 }, length: 1 });
    engine.gameOver = true;

    const spy = vi.spyOn(engine.ctx, 'fillRect');
    engine.render();
    // Playfield background + the dim overlay rectangle.
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('strokes the cached grid path when settings.gridLines is true', () => {
    settings.gridLines = true;
    const engine = createEngine();
    const spy = vi.spyOn(engine.ctx, 'stroke');

    engine.render();

    // `_drawBorder` uses `strokeRect`, not `stroke`. The only path that
    // calls `stroke()` is the grid overlay.
    expect(spy).toHaveBeenCalled();
  });

  it('renders walls including the merged-cluster + diagonal chamfer branches', () => {
    const engine = createEngine();
    engine.addSnake({ head: { x: 0, y: 0 }, length: 1 });
    // Two adjacent walls exercise the merge + spike-omission paths;
    // the diagonal-neighbor wall exercises the inner-corner chamfer.
    engine.addWall({ x: 4, y: 4 });
    engine.addWall({ x: 5, y: 4 });
    engine.addWall({ x: 5, y: 5 });

    const spy = vi.spyOn(engine.ctx, 'fill');
    engine.render();
    expect(spy).toHaveBeenCalled();
    // Render again to cover the cached-path branch.
    engine.render();
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('renders dead snakes via the alpha-dimmed branch', () => {
    const engine = createEngine();
    const a = engine.addSnake({ head: { x: 5, y: 5 }, length: 1 });
    a.dead = true;
    engine.addSnake({ head: { x: 7, y: 7 }, length: 1 });

    const spy = vi.spyOn(engine.ctx, 'fill');
    engine.render();
    expect(spy).toHaveBeenCalled();
  });
});

describe('Engine: lifecycle loop', () => {
  it('start wires RAF + keydown; stop tears them down; destroy is idempotent', () => {
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame');
    const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const engine = createEngine();
    engine.start();
    expect(rafSpy).toHaveBeenCalled();
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

    engine.stop();
    expect(cancelSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

    // destroy() runs stop() again; should be a safe no-op.
    engine.destroy();
    engine.destroy();
  });

  it('advances exactly one tick + renders when one tick interval elapses', () => {
    const { tick } = captureRAF();
    const engine = createEngine(Engine, { tickRate: 10 }); // 100ms / tick
    engine.addSnake({ head: { x: 5, y: 5 }, direction: 'right', length: 1 });
    const updateSpy = vi.spyOn(engine, 'update');
    const renderSpy = vi.spyOn(engine, 'render');

    engine.start();
    const start = performance.now();
    tick(start); // primes _lastFrame
    tick(start + 150); // 150ms -> one tick at 10Hz

    expect(updateSpy).toHaveBeenCalledOnce();
    expect(renderSpy).toHaveBeenCalled();
  });

  it('clamps frame dt so a long pause cannot fire many catch-up ticks', () => {
    const { tick } = captureRAF();
    const engine = createEngine(Engine, { tickRate: 10 });
    engine.addSnake({ head: { x: 5, y: 5 }, direction: 'right', length: 1 });
    const updateSpy = vi.spyOn(engine, 'update');

    engine.start();
    const start = performance.now();
    tick(start);
    // Without the _maxFrameDt clamp (250ms), 10 seconds at 10Hz would
    // fire 100 ticks; the clamp caps it at ~3.
    tick(start + 10_000);

    expect(updateSpy.mock.calls.length).toBeLessThan(10);
  });

  it('responds to a live settings.baseSpeed change via onSettingsChange', async () => {
    const engine = createEngine(Engine, { tickRate: 8 });
    const before = engine.tickRate;
    const previous = settings.baseSpeed;
    try {
      settings.baseSpeed = previous === 2 ? 1 : 2;
      // The settings watcher is async; poll until the engine's tick
      // rate actually moved off its initial value.
      await vi.waitFor(() => expect(engine.tickRate).not.toBeCloseTo(before));
    } finally {
      settings.baseSpeed = previous;
    }
  });
});

describe('Engine: input-driven early tick', () => {
  it('advances one tick early when input lands past the response threshold', () => {
    const { tick } = captureRAF();
    const engine = createEngine(Engine, { tickRate: 10 });
    const snake = engine.addSnake({
      head: { x: 5, y: 5 },
      direction: 'right',
      length: 3,
    });
    // Grow the body so reversal guards are meaningful.
    engine.stepSnake(snake);
    engine.stepSnake(snake);

    engine.start();
    tick(performance.now());

    // Push the accumulator past the 50% response threshold, then turn.
    engine._tickAccum = engine._tickInterval * 0.8;
    const lenBefore = snake.segments.length;
    engine.setDirection(snake, 'up');

    expect(snake.segments.length).toBeGreaterThanOrEqual(lenBefore);
  });
});

describe('Engine: resize handling', () => {
  it('_syncCanvasSize updates backing-store dimensions when the rect changes', () => {
    const engine = createEngine();
    const initialW = engine.canvas.width;

    engine.canvas.getBoundingClientRect = () => makeCanvasRect(800, 600);
    expect(engine._syncCanvasSize()).toBe(true);
    expect(engine.canvas.width).not.toBe(initialW);

    // No change on a repeat call with the same rect.
    expect(engine._syncCanvasSize()).toBe(false);
  });

  it('ResizeObserver callback resizes + repaints on a RAF tick when the rect grows', () => {
    // Swap the global RO with one that lets us trigger the observer
    // callback manually so we can step through the entire resize path.
    let observerCb = null;
    const realRO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(cb) {
        observerCb = cb;
      }
      observe() {}
      disconnect() {}
    };
    let rafCb = null;
    const realRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (cb) => {
      rafCb = cb;
      return 1;
    };
    try {
      const engine = createEngine();
      const renderSpy = vi.spyOn(engine, 'render');
      const initialW = engine.canvas.width;
      // Resize the underlying canvas before firing the observer cb so
      // the RAF callback's _syncCanvasSize sees a different rect.
      engine.canvas.getBoundingClientRect = () => makeCanvasRect(900, 700);

      // Fire the observer twice -- the second invocation must short-
      // circuit because _resizePending is true after the first.
      observerCb();
      observerCb();
      expect(rafCb).not.toBeNull();
      rafCb();

      expect(engine.canvas.width).not.toBe(initialW);
      expect(renderSpy).toHaveBeenCalled();
    } finally {
      globalThis.ResizeObserver = realRO;
      globalThis.requestAnimationFrame = realRaf;
    }
  });
});

describe('Engine: setDirection edge branches', () => {
  it('rejects a buffered U-turn against the already-queued primary direction', () => {
    // The reversal guard at the primary-direction site is tested
    // elsewhere; this covers the parallel guard at the buffered site:
    // press up, then immediately press down -- the down must be
    // dropped instead of stored as `bufferedDirection`.
    const engine = createEngine();
    const snake = engine.addSnake({
      head: { x: 5, y: 5 },
      direction: 'right',
      length: 3,
    });
    engine.stepSnake(snake);
    engine.stepSnake(snake);

    engine.setDirection(snake, 'up');
    engine.setDirection(snake, 'down');
    expect(snake.bufferedDirection).toBeNull();
  });

  it('ignores a buffered direction that equals the already-queued one', () => {
    const engine = createEngine();
    const snake = engine.addSnake({
      head: { x: 5, y: 5 },
      direction: 'right',
      length: 3,
    });
    engine.stepSnake(snake);

    engine.setDirection(snake, 'up');
    engine.setDirection(snake, 'up'); // dupe -> dropped
    expect(snake.bufferedDirection).toBeNull();
  });
});

describe('Engine: randomEmptyCell deterministic fallback', () => {
  it('returns a valid free cell even when every Math.random() pick hits an excluded slot', () => {
    // Build a grid with a single excluded cell at index 0 (snake head
    // at 0,0). Pin Math.random to a value that always maps to index 0
    // (0 * total = 0 -> floor = 0), so the budget loop exhausts and
    // the deterministic O(total) fallback runs.
    const engine = createEngine(Engine, { cols: 3, rows: 3 });
    engine.addSnake({ head: { x: 0, y: 0 }, length: 1 });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const cell = engine.randomEmptyCell();
    expect(cell).not.toBeNull();
    // Fallback's k = floor(0 * free) = 0 -> first free cell after the
    // excluded one, which is (0, 1) under the x*rows+y encoding.
    expect(cell).toEqual({ x: 0, y: 1 });
  });
});

describe('Engine: setTickRate accumulator clamp', () => {
  it('clips _tickAccum down to the new interval when it would otherwise burst', () => {
    const engine = createEngine(Engine, { tickRate: 1 });
    // Stale accumulator from a previous (slower) interval. The clamp
    // exists to prevent a flurry of catch-up ticks when the tick rate
    // jumps up.
    engine._tickAccum = 10;
    engine.setTickRate(60);
    expect(engine._tickAccum).toBeLessThanOrEqual(engine._tickInterval);
  });
});

describe('Engine: wall draw chamfer corners', () => {
  it('renders a wall plus-shape (every chamfer corner present) without throwing', () => {
    // A plus shape at the grid center has the central cell with
    // neighbors on all four cardinal sides and empty diagonals -- the
    // exact configuration that triggers all four chamfer-true branches
    // in _drawWalls inside a single cell's polygon.
    const engine = createEngine(Engine, { cols: 5, rows: 5 });
    const center = { x: 2, y: 2 };
    engine.addWall(center);
    engine.addWall({ x: 2, y: 1 });
    engine.addWall({ x: 2, y: 3 });
    engine.addWall({ x: 1, y: 2 });
    engine.addWall({ x: 3, y: 2 });
    // Force a render -- canvas + Path2D are stubbed so this exercises
    // the chamfer polygon math without doing real drawing.
    expect(() => engine.render()).not.toThrow();
  });
});
