import { describe, expect, it } from 'vitest';

import games from '~/games/index.js';

// Central registry consumed by the home page (preview tiles) and the
// dynamic [game].vue route. A typo here would surface as a runtime
// navigation error; we'd rather it fail at the test layer.

const EXPECTED_NAMES = [
  'classic',
  'chase',
  'tunnels',
  'spikes',
  'endless',
  'mirror',
  'duo',
  'inverted',
];

describe('games registry', () => {
  it('exports every expected entry with the required shape', () => {
    expect(Array.isArray(games)).toBe(true);
    expect(games.map((g) => g.name).sort()).toEqual([...EXPECTED_NAMES].sort());

    for (const game of games) {
      expect(typeof game.name).toBe('string');
      expect(typeof game.load).toBe('function');
      expect(typeof game.preview).toBe('string'); // raw SVG
    }
  });

  it('has unique entry names', () => {
    const names = games.map((g) => g.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(EXPECTED_NAMES)(
    'load() for %s resolves to an Engine subclass',
    async (name) => {
      const entry = games.find((g) => g.name === name);
      const { default: GameClass } = await entry.load();

      // Walk the prototype chain via duck-typing -- every game subclass
      // inherits these methods from Engine.
      expect(typeof GameClass).toBe('function');
      expect(typeof GameClass.prototype.stepAll).toBe('function');
      expect(typeof GameClass.prototype.addSnake).toBe('function');
      expect(typeof GameClass.prototype.randomEmptyCell).toBe('function');
    }
  );
});
