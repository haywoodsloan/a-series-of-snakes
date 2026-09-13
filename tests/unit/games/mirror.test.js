import { describe, expect, it, vi } from 'vitest';
import Mirror from '~/games/mirror.js';
import { GRID_SIZE_OPTIONS, settings } from '~/utils/settings.js';

import {
  createEngine,
  dispatchKey,
  setupEngineTest,
} from '../../helpers/engine.js';

setupEngineTest();

describe('Mirror', () => {
  it.each(GRID_SIZE_OPTIONS)(
    'uses the selected %i-cell square grid and leaderboard category',
    (size) => {
      settings.gridSize = size;
      const game = createEngine(Mirror);
      expect(game.cols).toBe(size);
      expect(game.rows).toBe(size);
      expect(game.gameKey).toBe(`mirror:g${size}:s1`);
      expect(game.snakes).toHaveLength(2);
      const [a, b] = game.snakes.map((snake) => snake.segments[0]);
      expect(a.x + b.x).toBe(size - 1);
      expect((b.y - a.y + size) % size).toBe(Math.floor(size / 2));
    }
  );

  it('preserves mirroring through the center column and wraps on an odd grid', () => {
    settings.gridSize = 75;
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const game = createEngine(Mirror);
    game.food = [];
    game._started = true;
    const [a, b] = game.snakes;

    // From opposite edges, both heads reach column 37 together, but
    // the 37-row offset keeps them distinct on the odd-sized board.
    for (let step = 1; step <= 75; step++) {
      game.update();
      expect(a.segments[0]).toEqual({ x: step % 75, y: 0 });
      expect(b.segments[0]).toEqual({ x: (149 - step) % 75, y: 37 });
      expect(game.gameOver).toBe(false);
    }

    game.setDirection(a, 'up');
    game.setDirection(b, 'up');
    game.update();
    expect(a.segments[0]).toEqual({ x: 0, y: 74 });
    expect(b.segments[0]).toEqual({ x: 74, y: 36 });
    expect(game.gameOver).toBe(false);
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
