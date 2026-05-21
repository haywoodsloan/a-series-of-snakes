import { describe, expect, it } from 'vitest';
import Inverted from '~/games/inverted.js';

import {
  createEngine,
  dispatchKey,
  setupEngineTest,
} from '../../helpers/engine.js';

setupEngineTest();

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
