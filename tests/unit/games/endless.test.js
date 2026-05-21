import { describe, expect, it } from 'vitest';
import Endless from '~/games/endless.js';

import { createEngine, setupEngineTest } from '../../helpers/engine.js';

setupEngineTest();

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
