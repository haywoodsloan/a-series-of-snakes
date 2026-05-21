import { describe, expect, it } from 'vitest';
import Spikes from '~/games/spikes.js';

import { createEngine, setupEngineTest } from '../../helpers/engine.js';

setupEngineTest();

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
