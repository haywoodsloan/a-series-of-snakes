import { describe, expect, it } from 'vitest';
import Duo from '~/games/duo.js';

import {
  createEngine,
  dispatchKey,
  setupEngineTest,
} from '../../helpers/engine.js';

setupEngineTest();

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

  it('wasd input starts only the wasd snake', () => {
    const game = createEngine(Duo);
    game.start();
    dispatchKey('KeyD');
    game.stop();
    expect(game._startedWasd).toBe(true);
    expect(game._startedArrows).toBe(false);
  });

  it('arrow input starts only the arrows snake', () => {
    const game = createEngine(Duo);
    game.start();
    dispatchKey('ArrowRight');
    game.stop();
    expect(game._startedArrows).toBe(true);
    expect(game._startedWasd).toBe(false);
  });

  it('update() is a no-op while both snakes are idle', () => {
    const game = createEngine(Duo);
    const wasdHead = { ...game._snakeWasd.segments[0] };
    const arrowsHead = { ...game._snakeArrows.segments[0] };
    game.update();
    expect(game._snakeWasd.segments[0]).toEqual(wasdHead);
    expect(game._snakeArrows.segments[0]).toEqual(arrowsHead);
  });

  it('update() steps both via stepAll once both players are in', () => {
    const game = createEngine(Duo);
    game._startedWasd = true;
    game._startedArrows = true;
    const wHead = { ...game._snakeWasd.segments[0] };
    const aHead = { ...game._snakeArrows.segments[0] };

    game.update();

    expect(game._snakeWasd.segments[0]).not.toEqual(wHead);
    expect(game._snakeArrows.segments[0]).not.toEqual(aHead);
  });

  it('update() returns early when gameOver is set', () => {
    const game = createEngine(Duo);
    game._startedWasd = true;
    game._startedArrows = true;
    game.gameOver = true;
    const head = { ...game._snakeWasd.segments[0] };
    game.update();
    expect(game._snakeWasd.segments[0]).toEqual(head);
  });

  it('mixed-state update skips a dead active snake', () => {
    const game = createEngine(Duo);
    game._startedWasd = true;
    game._snakeWasd.dead = true;
    const head = { ...game._snakeWasd.segments[0] };
    game.update();
    expect(game._snakeWasd.segments[0]).toEqual(head);
  });

  it('mixed-state update consumes a pellet under the active head', () => {
    const game = createEngine(Duo);
    const snake = game._snakeWasd;
    snake.segments = [{ x: 5, y: 5 }];
    snake.direction = snake.nextDirection = 'right';
    game.food.length = 0;
    game.addFood({ x: 6, y: 5 });
    const wLen = snake.length;
    const aLen = game._snakeArrows.length;

    game._startedWasd = true;
    game.update();

    expect(game.food).toHaveLength(1); // respawned after eat
    expect(snake.length).toBe(wLen + 1);
    expect(game._snakeArrows.length).toBe(aLen + 1);
  });

  it('mixed-state update reports a collision via onCollision', () => {
    const game = createEngine(Duo);
    const snake = game._snakeWasd;
    // Body that wraps so the head's next step (right) lands on a body cell.
    snake.segments = [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 6, y: 6 },
      { x: 5, y: 6 },
      { x: 4, y: 6 },
      { x: 4, y: 5 },
    ];
    snake.direction = snake.nextDirection = 'right';
    snake.length = snake.segments.length;
    game.food.length = 0;

    game._startedWasd = true;
    game.update();

    expect(game.gameOver).toBe(true);
  });

  it('onEat from the arrows snake also grows the wasd snake', () => {
    const game = createEngine(Duo);
    const w = game._snakeWasd.length;
    const a = game._snakeArrows.length;

    game.onEat(game._snakeArrows, { x: 0, y: 0 });

    expect(game._snakeArrows.length).toBe(a + 1);
    expect(game._snakeWasd.length).toBe(w + 1);
  });
});
