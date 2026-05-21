import { describe, expect, it, vi } from 'vitest';
import Tunnels from '~/games/tunnels.js';

import { createEngine, setupEngineTest } from '../../helpers/engine.js';

setupEngineTest();

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
