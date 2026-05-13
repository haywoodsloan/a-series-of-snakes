// Tiny localStorage-backed app settings store. A single object is kept in
// memory and mirrored to localStorage on every write. Subscribers can be
// notified via `onSettingsChange()` so live game instances can react to
// changes without a reload.
import { reactive, watch } from 'vue';

const STORAGE_KEY = 'a-series-of-snakes:settings';

// Allowed values for the base-speed multiplier. The dropdown in the
// settings dialog uses these directly; the engine multiplies its requested
// tick rate by the selected value.
export const SPEED_OPTIONS = [0.25, 0.5, 1, 2];

/** @typedef {{ baseSpeed: number, gridLines: boolean }} Settings */

/** @type {Settings} */
const DEFAULTS = Object.freeze({
  baseSpeed: 1,
  gridLines: false,
});

function safeStorage() {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function load() {
  const ls = safeStorage();
  if (!ls) return { ...DEFAULTS };
  try {
    const raw = ls.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULTS };
    return {
      baseSpeed: SPEED_OPTIONS.includes(parsed.baseSpeed)
        ? parsed.baseSpeed
        : DEFAULTS.baseSpeed,
      gridLines:
        typeof parsed.gridLines === 'boolean'
          ? parsed.gridLines
          : DEFAULTS.gridLines,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

// Reactive singleton: imported anywhere that needs to read or write
// settings. The dialog binds form controls directly to this object.
/** @type {Settings} */
export const settings = reactive(load());

// Persist + fan out to listeners on any change. `deep: false` is fine
// because we only mutate primitive fields on this object.
/** @type {Set<(s: Settings) => void>} */
const listeners = new Set();
watch(
  () => ({ baseSpeed: settings.baseSpeed, gridLines: settings.gridLines }),
  (next) => {
    const ls = safeStorage();
    if (ls) {
      try {
        ls.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Quota exceeded / private mode -- silently drop.
      }
    }
    for (const fn of listeners) fn(next);
  }
);

/**
 * Subscribe to settings changes. Returns an unsubscribe function.
 * @param {(s: Settings) => void} fn
 */
export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
