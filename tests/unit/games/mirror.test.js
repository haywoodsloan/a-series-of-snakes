import { describe, expect, it } from 'vitest';
import Mirror from '~/games/mirror.js';

import {
  createEngine,
  dispatchKey,
  setupEngineTest,
} from '../../helpers/engine.js';

setupEngineTest();

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
