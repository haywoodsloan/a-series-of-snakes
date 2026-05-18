import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Chase from '../../games/chase.js';
import Classic from '../../games/classic.js';
import Duo from '../../games/duo.js';
import Endless from '../../games/endless.js';
import Inverted from '../../games/inverted.js';
import Mirror from '../../games/mirror.js';
import Spikes from '../../games/spikes.js';
import Tunnels from '../../games/tunnels.js';
import {
  createEngine,
  dispatchKey,
  installCanvasStubs,
} from '../helpers/engine.js';

beforeEach(() => {
  installCanvasStubs();
  window.localStorage.clear();
});

// `vi.spyOn` installs property descriptors that persist after the test;
// restore them so spies don't leak across tests or files.
afterEach(() => {
  vi.restoreAllMocks();
});

describe('Classic', () => {
  it('spawns one snake + one pellet and idles until input', () => {
    const game = createEngine(Classic);
    expect(game.snakes).toHaveLength(1);
    expect(game.food).toHaveLength(1);

    const head = { ...game.snakes[0].segments[0] };
    game.update();
    expect(game.snakes[0].segments[0]).toEqual(head);
  });
});

describe('Endless', () => {
  it('has no food and grows one segment per tick once started', () => {
    const game = createEngine(Endless);
    expect(game.food).toHaveLength(0);

    // Skip the keyboard plumbing by toggling the gate directly.
    game._started = true;
    const startLen = game.snakes[0].length;
    const startScore = game.score;

    game.update();

    expect(game.snakes[0].length).toBe(startLen + 1);
    expect(game.score).toBe(startScore + 1);
  });
});

describe('Inverted', () => {
  it('flips direction input before applying to the snake', () => {
    const game = createEngine(Inverted);
    const snake = game.snakes[0];
    snake.direction = snake.nextDirection = 'up';
    snake.segments = [
      { x: 5, y: 5 },
      { x: 5, y: 6 },
    ];

    game.start();
    dispatchKey('ArrowLeft'); // input 'left' must be flipped to 'right'
    game.stop();

    expect(snake.nextDirection).toBe('right');
  });
});

describe('Spikes', () => {
  it('seeds the board with walls, one snake, and one pellet', () => {
    const game = createEngine(Spikes);
    expect(game.walls.length).toBeGreaterThan(0);
    expect(game.snakes).toHaveLength(1);
    expect(game.food).toHaveLength(1);
  });

  it('onCollision delegates to the engine default (game over)', () => {
    const game = createEngine(Spikes);
    game.onCollision({
      type: 'wall',
      snake: game.snakes[0],
      at: { x: 0, y: 0 },
      wall: { x: 0, y: 0 },
    });
    expect(game.gameOver).toBe(true);
  });
});

describe('Mirror', () => {
  it('forces an even column count and starts with two snakes', () => {
    const game = createEngine(Mirror);
    expect(game.cols % 2).toBe(0);
    expect(game.snakes).toHaveLength(2);
  });

  it('mirrors horizontal input direction onto the partner snake', () => {
    const game = createEngine(Mirror);
    const [a, b] = game.snakes;
    for (const s of [a, b]) {
      s.segments = [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
      ];
      s.direction = s.nextDirection = 'up';
    }

    game.start();
    dispatchKey('ArrowLeft');
    game.stop();

    expect(a.nextDirection).toBe('left');
    expect(b.nextDirection).toBe('right'); // mirrored
  });

  it('either snake eating grows both', () => {
    const game = createEngine(Mirror);
    const [a, b] = game.snakes;
    const [aLen, bLen] = [a.length, b.length];

    game.onEat(a, { x: 0, y: 0 });

    expect(a.length).toBe(aLen + 1);
    expect(b.length).toBe(bLen + 1);
  });
});

describe('Duo', () => {
  it('starts with two snakes + one pellet', () => {
    const game = createEngine(Duo);
    expect(game.snakes).toHaveLength(2);
    expect(game.food).toHaveLength(1);
  });

  it('per-snake gating: only the snake whose input fired moves', () => {
    const game = createEngine(Duo);
    const wasdHead = { ...game._snakeWasd.segments[0] };
    const arrowsHead = { ...game._snakeArrows.segments[0] };

    game._startedWasd = true;
    game.update();

    expect(game._snakeWasd.segments[0]).not.toEqual(wasdHead);
    expect(game._snakeArrows.segments[0]).toEqual(arrowsHead);
  });

  it('either snake eating grows both', () => {
    const game = createEngine(Duo);
    const [wLen, aLen] = [game._snakeWasd.length, game._snakeArrows.length];

    game.onEat(game._snakeWasd, { x: 0, y: 0 });

    expect(game._snakeWasd.length).toBe(wLen + 1);
    expect(game._snakeArrows.length).toBe(aLen + 1);
  });
});

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

  it('schedules + clears its food timer across start/stop', () => {
    vi.useFakeTimers();
    try {
      const game = createEngine(Chase);
      expect(game._foodTimer).toBe(0);

      game._scheduleFoodTimer();
      expect(game._foodTimer).not.toBe(0);

      game._clearFoodTimer();
      expect(game._foodTimer).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Tunnels', () => {
  it('starts with the configured tunnel count', () => {
    const game = createEngine(Tunnels);
    expect(game._tunnelsRemaining).toBeGreaterThan(0);
  });

  it('consumes a tunnel on self-hit and tags the body segment', () => {
    const game = createEngine(Tunnels);
    const snake = game._snake;
    snake.segments = [
      { x: 5, y: 5 }, // head
      { x: 4, y: 5 },
      { x: 4, y: 4 },
      { x: 5, y: 4 },
    ];
    const before = game._tunnelsRemaining;

    game.onCollision({ type: 'self', snake, at: { x: 4, y: 5 } });

    expect(game._tunnelsRemaining).toBe(before - 1);
    expect(snake.segments[1].tunneled).toBe(true);
    expect(game.gameOver).toBe(false);
  });

  it('ends the game on self-hit once tunnels are exhausted', () => {
    const game = createEngine(Tunnels);
    const snake = game._snake;
    snake.segments = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
    ];
    game._tunnelsRemaining = 0;

    game.onCollision({ type: 'self', snake, at: { x: 4, y: 5 } });
    expect(game.gameOver).toBe(true);
  });

  it('refunds a tunnel when a tagged segment is popped off the tail', () => {
    const game = createEngine(Tunnels);
    const snake = game._snake;
    snake.segments = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5, tunneled: true },
    ];
    snake.length = 3;
    snake.direction = snake.nextDirection = 'right';

    const before = game._tunnelsRemaining;
    game.stepSnake(snake);
    expect(game._tunnelsRemaining).toBe(before + 1);
  });

  it('is a no-op when every overlapping segment is already tagged', () => {
    const game = createEngine(Tunnels);
    const snake = game._snake;
    snake.segments = [
      { x: 5, y: 5 }, // head
      { x: 4, y: 5, tunneled: true },
      { x: 4, y: 4, tunneled: true },
    ];
    const before = game._tunnelsRemaining;

    game.onCollision({ type: 'self', snake, at: { x: 4, y: 5 } });

    expect(game._tunnelsRemaining).toBe(before);
    expect(game.gameOver).toBe(false);
  });

  it('delegates non-self collisions to the engine default', () => {
    const game = createEngine(Tunnels);
    game.onCollision({
      type: 'wall',
      snake: game._snake,
      at: { x: 0, y: 0 },
      wall: { x: 0, y: 0 },
    });
    expect(game.gameOver).toBe(true);
  });

  it('renders the tunnel HUD readout', () => {
    const game = createEngine(Tunnels);
    game._snake.segments = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5, tunneled: true }, // exercises the alt-color branch
    ];

    const spy = vi.spyOn(game.ctx, 'fillText');
    game.render();

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('TUNNELS'),
      expect.any(Number),
      expect.any(Number)
    );
  });

  it('renders dead snakes via the alpha-dimmed branch', () => {
    const game = createEngine(Tunnels);
    game._snake.dead = true;
    game._snake.segments = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
    ];

    const spy = vi.spyOn(game.ctx, 'fill');
    game.render();
    expect(spy).toHaveBeenCalled();
  });
});
