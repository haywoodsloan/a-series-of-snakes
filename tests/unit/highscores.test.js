import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_ENTRIES,
  NAME_LEN,
  loadScores,
  qualifies,
  sanitizeInitials,
  sanitizeName,
  saveScore,
  topScore,
} from '~/utils/highscores.js';

import { highScoreKey } from '../helpers/storage.js';

const KEY = 'test-game:g30:s1';

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe('sanitizeInitials', () => {
  it('uppercases and strips non-A-Z characters', () => {
    expect(sanitizeInitials('ab1c!')).toBe('ABC');
  });

  it('caps at NAME_LEN', () => {
    const out = sanitizeInitials('abcdefgh');
    expect(out).toBe('ABC');
    expect(out).toHaveLength(NAME_LEN);
  });

  it('coerces non-strings to empty', () => {
    expect(sanitizeInitials(null)).toBe('');
    expect(sanitizeInitials(undefined)).toBe('');
    expect(sanitizeInitials(42)).toBe('');
  });
});

describe('sanitizeName', () => {
  it('pads short names with underscores up to NAME_LEN', () => {
    expect(sanitizeName('a')).toBe('A__');
    expect(sanitizeName('')).toBe('___');
  });
});

describe('saveScore + loadScores', () => {
  it('persists across calls and sorts descending', () => {
    saveScore(KEY, 'AAA', 5);
    saveScore(KEY, 'BBB', 10);
    saveScore(KEY, 'CCC', 1);

    const list = loadScores(KEY);
    expect(list.map((e) => e.score)).toEqual([10, 5, 1]);
    expect(list.map((e) => e.name)).toEqual(['BBB', 'AAA', 'CCC']);
  });

  it('caps the list at MAX_ENTRIES, keeping the highest scores', () => {
    for (let i = 0; i < MAX_ENTRIES + 5; i++) saveScore(KEY, 'ZZZ', i);

    const list = loadScores(KEY);
    expect(list).toHaveLength(MAX_ENTRIES);
    expect(list[0].score).toBe(MAX_ENTRIES + 4);
  });

  it('truncates non-integer scores to int32 (`| 0`)', () => {
    saveScore(KEY, 'AAA', 3.9);
    expect(loadScores(KEY)[0].score).toBe(3);
  });

  it('returns [] for corrupt localStorage payloads', () => {
    window.localStorage.setItem(highScoreKey(KEY), 'not-json-{{');
    expect(loadScores(KEY)).toEqual([]);
  });
});

describe('qualifies', () => {
  it('rejects non-positive and non-finite scores', () => {
    expect(qualifies(KEY, 0)).toBe(false);
    expect(qualifies(KEY, -5)).toBe(false);
    expect(qualifies(KEY, NaN)).toBe(false);
    expect(qualifies(KEY, Infinity)).toBe(false);
  });

  it('accepts any positive score while the list is short', () => {
    expect(qualifies(KEY, 1)).toBe(true);
  });

  it('compares against the floor once the list is full', () => {
    for (let i = 1; i <= MAX_ENTRIES; i++) saveScore(KEY, 'ZZZ', i * 10);
    expect(qualifies(KEY, 5)).toBe(false); // below floor (10)
    expect(qualifies(KEY, 15)).toBe(true); // above floor
  });
});

describe('topScore', () => {
  it('returns 0 when no scores are stored', () => {
    expect(topScore(KEY)).toBe(0);
  });

  it('returns the highest stored score', () => {
    saveScore(KEY, 'AAA', 7);
    saveScore(KEY, 'BBB', 12);
    expect(topScore(KEY)).toBe(12);
  });
});
