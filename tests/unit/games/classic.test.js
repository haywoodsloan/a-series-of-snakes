import { describe, expect, it } from 'vitest';
import Classic from '~/games/classic.js';

import { createEngine, setupEngineTest } from '../../helpers/engine.js';

setupEngineTest();

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
