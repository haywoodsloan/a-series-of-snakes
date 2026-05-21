import { describe, expect, it } from 'vitest';
import Chase from '~/games/chase.js';
import Classic from '~/games/classic.js';
import Endless from '~/games/endless.js';
import Inverted from '~/games/inverted.js';
import Mirror from '~/games/mirror.js';
import Spikes from '~/games/spikes.js';
import Tunnels from '~/games/tunnels.js';

import {
  createEngine,
  dispatchKey,
  setupEngineTest,
} from '../../helpers/engine.js';

// Cross-game lifecycle smoke: every variant must wire `onInput` through
// to the `_started` gate and treat `update()` as a no-op while idle or
// after game over. Game-specific mechanics live in each game's own
// `*.test.js`; this file is data-driven so adding a new game is a
// single row.
//
// Duo is excluded -- it splits the start gate per-player
// (`_startedWasd` / `_startedArrows`), so it owns its own lifecycle
// tests in `duo.test.js`.

setupEngineTest();

const VARIANTS = [
  ['Classic', Classic],
  ['Endless', Endless],
  ['Inverted', Inverted],
  ['Mirror', Mirror],
  ['Spikes', Spikes],
  ['Tunnels', Tunnels],
  ['Chase', Chase],
];

describe.each(VARIANTS)('%s lifecycle', (_name, GameClass) => {
  it('starts on key input and accepts update() without throwing', () => {
    const game = createEngine(GameClass);
    game.start();
    dispatchKey('ArrowRight');
    game.stop();

    expect(game._started).toBe(true);
    game.update();
  });

  it('update() is a no-op while idle or after game over', () => {
    const game = createEngine(GameClass);
    const snake = game.snakes[0];
    const head = { ...snake.segments[0] };

    game.update(); // _started === false
    expect(snake.segments[0]).toEqual(head);

    game._started = true;
    game.gameOver = true;
    game.update();
    expect(snake.segments[0]).toEqual(head);
  });
});
