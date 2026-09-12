import { beforeEach, describe, expect, it, vi } from 'vitest';
import Chase from '~/games/chase.js';
import Classic from '~/games/classic.js';
import Duo from '~/games/duo.js';
import Endless from '~/games/endless.js';
import Inverted from '~/games/inverted.js';
import Mirror from '~/games/mirror.js';
import Rpg from '~/games/rpg.js';
import Spikes from '~/games/spikes.js';
import Tunnels from '~/games/tunnels.js';

import {
  captureRAF,
  createEngine,
  dispatchKey,
  dispatchTouch,
  dispatchTouchEvent,
  makeCanvasRect,
  setupEngineTest,
} from '../helpers/engine.js';

setupEngineTest();
beforeEach(() => {
  captureRAF();
  vi.spyOn(performance, 'now').mockReturnValue(0);
});

const DIRECTIONAL_GAMES = [
  Classic,
  Chase,
  Tunnels,
  Spikes,
  Endless,
  Mirror,
  Duo,
  Inverted,
];

describe.each(DIRECTIONAL_GAMES.map((Game) => [Game.name, Game]))(
  '%s mobile steering',
  (_, Game) => {
    it('steers before the swiping finger lifts, preserving the variant mapping', () => {
      const game = createEngine(Game);
      game.start();
      dispatchTouchEvent(game.canvas, 'touchstart', { x: 200, y: 200 });
      dispatchTouchEvent(game.canvas, 'touchmove', { x: 200, y: 160 });

      expect(game.snakes[0].nextDirection).toBe(
        Game === Inverted ? 'down' : 'up'
      );
      if (Game === Mirror) expect(game.snakes[1].nextDirection).toBe('up');
      if (Game === Duo) {
        expect(game._startedWasd).toBe(true);
        expect(game._startedArrows).toBe(false);
      } else {
        expect(game._started).toBe(true);
      }
    });

    it('keeps edge taps available', () => {
      const game = createEngine(Game);
      game.start();
      dispatchTouch(game.canvas, { x: 200, y: 30 });
      expect(game.snakes[0].nextDirection).toBe(
        Game === Inverted ? 'down' : 'up'
      );
    });
  }
);

describe('Touch gesture ownership and responsiveness', () => {
  const listeningEngine = () => {
    const engine = createEngine();
    const directions = [];
    engine.onInput(({ dir }) => directions.push(dir));
    engine.start();
    return { engine, directions };
  };

  it('allows successive turns without lifting and does not repeat on release', () => {
    const { engine, directions } = listeningEngine();
    dispatchTouchEvent(engine.canvas, 'touchstart', { x: 200, y: 200 });
    const move = dispatchTouchEvent(engine.canvas, 'touchmove', {
      x: 200,
      y: 160,
    });
    expect(move.defaultPrevented).toBe(true);
    expect(directions).toEqual(['up']);
    dispatchTouchEvent(engine.canvas, 'touchmove', { x: 200, y: 120 });
    dispatchTouchEvent(engine.canvas, 'touchmove', { x: 240, y: 120 });
    dispatchTouchEvent(engine.canvas, 'touchend', { x: 240, y: 120 });
    expect(directions).toEqual(['up', 'right']);
  });

  it('ignores jitter below the swipe threshold', () => {
    const { engine, directions } = listeningEngine();
    dispatchTouchEvent(engine.canvas, 'touchstart', { x: 200, y: 30 });
    dispatchTouchEvent(engine.canvas, 'touchmove', { x: 204, y: 34 });
    expect(directions).toEqual([]);
    dispatchTouchEvent(engine.canvas, 'touchend', { x: 204, y: 34 });
    expect(directions).toEqual(['up']);
  });

  it('does not let another finger replace or release the active gesture', () => {
    const { engine, directions } = listeningEngine();
    dispatchTouchEvent(engine.canvas, 'touchstart', {
      x: 200,
      y: 200,
      identifier: 7,
    });
    dispatchTouchEvent(engine.canvas, 'touchstart', {
      x: 380,
      y: 200,
      identifier: 8,
    });
    dispatchTouchEvent(engine.canvas, 'touchend', {
      x: 380,
      y: 200,
      identifier: 8,
    });
    expect(directions).toEqual([]);
    dispatchTouchEvent(engine.canvas, 'touchend', {
      x: 200,
      y: 150,
      identifier: 7,
    });
    expect(directions).toEqual(['up']);
  });

  it('finds the active finger even when it is not first in changedTouches', () => {
    const { engine, directions } = listeningEngine();
    dispatchTouchEvent(engine.canvas, 'touchstart', {
      x: 200,
      y: 200,
      identifier: 7,
    });
    dispatchTouchEvent(engine.canvas, 'touchmove', [
      { x: 380, y: 200, identifier: 8 },
      { x: 200, y: 160, identifier: 7 },
    ]);
    expect(directions).toEqual(['up']);
  });

  it.each(['touchcancel', 'blur', 'hidden', 'stop'])(
    'discards a pending tap after %s',
    (reason) => {
      const { engine, directions } = listeningEngine();
      dispatchTouchEvent(engine.canvas, 'touchstart', { x: 200, y: 30 });
      if (reason === 'touchcancel') {
        dispatchTouchEvent(engine.canvas, 'touchcancel', { x: 200, y: 30 });
      } else if (reason === 'blur') {
        window.dispatchEvent(new Event('blur'));
      } else if (reason === 'hidden') {
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        document.dispatchEvent(new Event('visibilitychange'));
      } else {
        engine.stop();
        engine.start();
      }
      dispatchTouchEvent(engine.canvas, 'touchend', { x: 200, y: 30 });
      expect(directions).toEqual([]);
      dispatchTouch(engine.canvas, { x: 370, y: 200 });
      expect(directions).toEqual(['right']);
    }
  );

  it('keeps diagonal edge tap regions balanced on a tall canvas', () => {
    const { engine, directions } = listeningEngine();
    engine.canvas.getBoundingClientRect = () => ({
      ...makeCanvasRect(390, 700),
      left: 20,
      top: 80,
    });
    dispatchTouch(engine.canvas, { x: 395, y: 210 });
    expect(directions).toEqual(['right']);
  });
});

describe('RPG held touch controls', () => {
  it('changes strafe while sliding, with a stable center boundary', () => {
    const game = createEngine(Rpg);
    game.start();
    dispatchTouchEvent(game.canvas, 'touchstart', { x: 200, y: 40 });
    const move = dispatchTouchEvent(game.canvas, 'touchmove', {
      x: 200,
      y: 360,
    });
    expect(move.defaultPrevented).toBe(true);
    expect(game._strafe).toBe('down');
    dispatchTouchEvent(game.canvas, 'touchmove', { x: 200, y: 198 });
    expect(game._strafe).toBe('down');
    dispatchTouchEvent(game.canvas, 'touchmove', { x: 200, y: 160 });
    expect(game._strafe).toBe('up');
  });

  it.each(['touchend', 'touchcancel'])(
    'releases the owning finger from a batched %s',
    (type) => {
      const game = createEngine(Rpg);
      game.start();
      dispatchKey('ArrowDown');
      dispatchTouchEvent(game.canvas, 'touchstart', {
        x: 200,
        y: 40,
        identifier: 7,
      });
      dispatchTouchEvent(game.canvas, type, [
        { x: 200, y: 360, identifier: 8 },
        { x: 200, y: 40, identifier: 7 },
      ]);
      expect(game._strafe).toBe('down');
      expect(game._touchStrafeId).toBeNull();
    }
  );

  it.each(['blur', 'hidden', 'stop', 'combat', 'combat exit'])(
    'clears held input on %s rather than resuming a stale strafe',
    (reason) => {
      const game = createEngine(Rpg);
      game.start();
      dispatchKey('ArrowDown');
      dispatchTouchEvent(game.canvas, 'touchstart', { x: 200, y: 40 });
      if (reason === 'blur') {
        window.dispatchEvent(new Event('blur'));
      } else if (reason === 'hidden') {
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        document.dispatchEvent(new Event('visibilitychange'));
      } else if (reason === 'combat') {
        game._beginCombat({ hp: 20, maxHp: 20 });
      } else if (reason === 'combat exit') {
        game._phase = 'combat';
        game._endCombat();
      } else {
        game.stop();
        game.start();
      }
      expect(game._strafe).toBeNull();
      expect(game._touchStrafeId).toBeNull();
    }
  );
});

describe('RPG combat tap targets', () => {
  it.each([
    [1, 320, 640],
    [2, 320, 640],
    [3, 320, 640],
    [1, 800, 240],
    [2, 800, 240],
    [3, 800, 240],
    [3, 390, 731.87],
  ])(
    'keeps 44 CSS pixel action rows at DPR %s on a %sx%s canvas',
    (dpr, width, height) => {
      vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(dpr);
      const game = createEngine(Rpg);
      game.canvas.getBoundingClientRect = () => makeCanvasRect(width, height);
      game._syncCanvasSize();
      const layout = game._gridLayout();
      const menu = game._combatMenuMetrics(layout);
      const scaleY = game.canvas.height / height;
      expect(menu.slotH / scaleY).toBeGreaterThanOrEqual(44);
      expect(menu.actionsTop).toBeGreaterThanOrEqual(menu.panelTop);
      expect(menu.actionsTop + menu.slotH * 3).toBeLessThanOrEqual(
        menu.panelBottom
      );
      expect(menu.panelBottom).toBeLessThanOrEqual(game.canvas.height);
      const sprites = game._combatSpriteGeom(layout);
      expect(sprites.playerCenterY + sprites.spriteSize / 2).toBeLessThan(
        menu.panelTop
      );
    }
  );

  it('ignores taps beside the menu on a letterboxed landscape canvas', () => {
    const game = createEngine(Rpg);
    game.canvas.getBoundingClientRect = () => makeCanvasRect(800, 400);
    game._syncCanvasSize();
    game._phase = 'combat';
    const { actionsTop, slotH } = game._combatMenuMetrics(game._gridLayout());
    expect(game._combatActionAt(actionsTop + slotH / 2, 10)).toBeNull();
    expect(game._combatActionAt(actionsTop + slotH / 2, 400)).toBe('attack');
  });
});
