import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GRID_SIZE_OPTIONS,
  SPEED_OPTIONS,
  onSettingsChange,
  settings,
} from '~/utils/settings.js';

import { STORAGE_KEY_SETTINGS } from '../helpers/storage.js';

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('settings', () => {
  it('exposes the allowed option arrays', () => {
    expect(SPEED_OPTIONS).toContain(1);
    expect(SPEED_OPTIONS.length).toBeGreaterThan(1);
    expect(GRID_SIZE_OPTIONS).toContain(30);
  });

  it('persists mutations to localStorage', async () => {
    settings.gridLines = true;

    // `vi.waitFor` polls until the assertion passes -- preferable to a
    // hard `setTimeout(N)` because it terminates as soon as the watcher
    // has flushed, not at some guessed wall-clock interval.
    await vi.waitFor(() => {
      const raw = window.localStorage.getItem(STORAGE_KEY_SETTINGS);
      expect(JSON.parse(raw ?? 'null')?.gridLines).toBe(true);
    });
  });

  it('onSettingsChange fires listeners with the new value', async () => {
    const calls = [];
    const unsubscribe = onSettingsChange((s) => calls.push(s.baseSpeed));
    const target = SPEED_OPTIONS.find((v) => v !== settings.baseSpeed);

    settings.baseSpeed = target;
    await vi.waitFor(() => expect(calls.at(-1)).toBe(target));

    unsubscribe();
  });

  it('unsubscribing stops further notifications', async () => {
    const handler = vi.fn();
    const unsubscribe = onSettingsChange(handler);

    // Pick a value that's actually different from the current speed so
    // the watcher is guaranteed to fire.
    const firstTarget = SPEED_OPTIONS.find((v) => v !== settings.baseSpeed);
    settings.baseSpeed = firstTarget;
    await vi.waitFor(() => expect(handler).toHaveBeenCalled());
    const before = handler.mock.calls.length;

    unsubscribe();
    const secondTarget = SPEED_OPTIONS.find((v) => v !== settings.baseSpeed);
    settings.baseSpeed = secondTarget;
    // Short fixed wait: we're proving the listener does NOT fire, so
    // there's nothing for `vi.waitFor` to converge on.
    await new Promise((r) => setTimeout(r, 20));

    expect(handler.mock.calls).toHaveLength(before);
  });

  describe('load() value validation', () => {
    // The reactive singleton is initialized once at module-import time,
    // so to exercise the load() validator we plant a value, reset the
    // module cache, and re-import.
    const reload = async () => {
      vi.resetModules();
      return import('~/utils/settings.js');
    };

    const assertDefaults = (fresh) => {
      expect(SPEED_OPTIONS).toContain(fresh.settings.baseSpeed);
      expect(typeof fresh.settings.gridLines).toBe('boolean');
      expect(GRID_SIZE_OPTIONS).toContain(fresh.settings.gridSize);
    };

    it('falls back to defaults when the stored payload is corrupt JSON', async () => {
      window.localStorage.setItem(STORAGE_KEY_SETTINGS, '{{not-json');
      assertDefaults(await reload());
    });

    it('falls back to defaults when stored values are out of range', async () => {
      window.localStorage.setItem(
        STORAGE_KEY_SETTINGS,
        JSON.stringify({ baseSpeed: 99, gridLines: 'sure', gridSize: 7 })
      );
      assertDefaults(await reload());
    });
  });
});
