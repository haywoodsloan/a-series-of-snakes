import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GRID_SIZE_OPTIONS,
  SPEED_OPTIONS,
  onSettingsChange,
  settings,
} from '../../utils/settings.js';
import { STORAGE_KEY_SETTINGS } from '../helpers/storage.js';

// The settings watcher flushes asynchronously; this wait is short enough
// to keep the suite fast while reliable across CI/local timing.
const flushWatch = () => new Promise((r) => setTimeout(r, 10));

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
    await flushWatch();

    const raw = window.localStorage.getItem(STORAGE_KEY_SETTINGS);
    expect(JSON.parse(raw).gridLines).toBe(true);
  });

  it('onSettingsChange fires listeners with the new value', async () => {
    const calls = [];
    const unsubscribe = onSettingsChange((s) => calls.push(s.baseSpeed));

    const target = SPEED_OPTIONS.find((v) => v !== settings.baseSpeed);
    settings.baseSpeed = target;
    await flushWatch();

    expect(calls.at(-1)).toBe(target);
    unsubscribe();
  });

  it('unsubscribing stops further notifications', async () => {
    const handler = vi.fn();
    const unsubscribe = onSettingsChange(handler);

    settings.baseSpeed = SPEED_OPTIONS[0];
    await flushWatch();
    const before = handler.mock.calls.length;

    unsubscribe();
    settings.baseSpeed = SPEED_OPTIONS.at(-1);
    await flushWatch();

    expect(handler.mock.calls).toHaveLength(before);
  });

  describe('load() value validation', () => {
    // The reactive singleton is initialized once at module-import time,
    // so to exercise the load() validator we plant a value, reset the
    // module cache, and re-import.
    async function reload() {
      vi.resetModules();
      return import('../../utils/settings.js');
    }

    it('falls back to defaults when the stored payload is corrupt JSON', async () => {
      window.localStorage.setItem(STORAGE_KEY_SETTINGS, '{{not-json');

      const fresh = await reload();

      expect(SPEED_OPTIONS).toContain(fresh.settings.baseSpeed);
      expect(typeof fresh.settings.gridLines).toBe('boolean');
      expect(GRID_SIZE_OPTIONS).toContain(fresh.settings.gridSize);
    });

    it('falls back to defaults when stored values are out of range', async () => {
      window.localStorage.setItem(
        STORAGE_KEY_SETTINGS,
        JSON.stringify({ baseSpeed: 99, gridLines: 'sure', gridSize: 7 })
      );

      const fresh = await reload();

      expect(SPEED_OPTIONS).toContain(fresh.settings.baseSpeed);
      expect(typeof fresh.settings.gridLines).toBe('boolean');
      expect(GRID_SIZE_OPTIONS).toContain(fresh.settings.gridSize);
    });
  });
});
