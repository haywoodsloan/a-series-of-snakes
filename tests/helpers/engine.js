// Shared DOM stubs + factory helpers for unit + integration tests that
// exercise the Engine (or any Engine subclass). happy-dom and the Nuxt
// vitest environment don't implement Canvas 2D, Path2D, or ResizeObserver,
// and have no useful layout for `getBoundingClientRect`.
//
// All draw operations are no-ops -- these tests verify game state, not
// pixel output. Visual correctness is owned by the Playwright visual
// regression suite under tests/visual/.
import { afterEach, beforeEach, onTestFinished, vi } from 'vitest';
import Engine from '~/games/engine.js';
import { settings } from '~/utils/settings.js';

class FakeContext2D {
  // Track the most recent `font` assignment so `measureText` can
  // return a width that scales with the requested pixel size. Real
  // canvas reads `ctx.font` back as a CSS string; we only need the
  // px component to estimate glyph advance.
  _font = '10px monospace';
  fillRect() {}
  clearRect() {}
  fillText() {}
  strokeRect() {}
  stroke() {}
  fill() {}
  clip() {}
  save() {}
  restore() {}
  beginPath() {}
  arc() {}
  // Rough monospace estimate -- good enough for layout tests that
  // need to know whether text fits inside a bar or panel. PublicPixel
  // (the app's display font) averages ~0.55 of font height per glyph.
  measureText(text = '') {
    const match = /(\d+(?:\.\d+)?)px/.exec(this._font);
    const fontPx = match ? parseFloat(match[1]) : 10;
    return { width: String(text).length * fontPx * 0.55 };
  }
  // Setter-only properties on the real CanvasRenderingContext2D --
  // declared explicitly so test code can spy on `ctx.fillStyle = ...`
  // assignments without throwing.
  set fillStyle(_) {}
  set strokeStyle(_) {}
  set lineWidth(_) {}
  set shadowColor(_) {}
  set shadowBlur(_) {}
  set globalAlpha(_) {}
  set font(v) {
    this._font = String(v);
  }
  set textAlign(_) {}
  set textBaseline(_) {}
}

class FakePath2D {
  moveTo() {}
  lineTo() {}
  rect() {}
  closePath() {}
}

class FakeResizeObserver {
  observe() {}
  disconnect() {}
}

/** Build a `getBoundingClientRect`-shaped object for the given size. */
export const makeCanvasRect = (width = 400, height = 400) =>
  Object.freeze({
    x: 0,
    y: 0,
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
  });

/**
 * Install Canvas 2D + Path2D + ResizeObserver stubs and a fixed
 * bounding-rect on every canvas. Registers an `onTestFinished` hook to
 * restore the originals, so prototype mutations don't leak between
 * test files in the same worker.
 *
 * Idempotent: safe to call from `beforeEach` or directly inside an
 * `it()`.
 */
export function installCanvasStubs() {
  // Snapshot every value we're about to overwrite, then restore from
  // the same map after the test. Keeping the restore declarative is
  // easier to extend than four parallel assignments.
  const globalStubs = {
    ResizeObserver: FakeResizeObserver,
    Path2D: FakePath2D,
  };
  const protoStubs = {
    getContext: vi.fn(() => new FakeContext2D()),
    getBoundingClientRect: vi.fn(() => makeCanvasRect()),
  };

  const globalOriginals = Object.fromEntries(
    Object.keys(globalStubs).map((k) => [k, globalThis[k]])
  );
  const protoOriginals = Object.fromEntries(
    Object.keys(protoStubs).map((k) => [k, HTMLCanvasElement.prototype[k]])
  );

  Object.assign(globalThis, globalStubs);
  Object.assign(HTMLCanvasElement.prototype, protoStubs);

  onTestFinished(() => {
    Object.assign(globalThis, globalOriginals);
    Object.assign(HTMLCanvasElement.prototype, protoOriginals);
  });
}

/** A detached canvas ready to hand to an Engine. */
export const makeCanvas = () => document.createElement('canvas');

/**
 * Standard `beforeEach` / `afterEach` block for any unit or integration
 * test that drives an Engine: install canvas stubs, reset the settings
 * singleton to engine defaults, clear localStorage, and restore
 * mocks/spies after every test. Call once at the top of the file.
 *
 * The settings singleton is reactive and persists across tests in the
 * same vitest worker; resetting here keeps tick rate + render branches
 * deterministic regardless of file order.
 */
export function setupEngineTest() {
  beforeEach(() => {
    installCanvasStubs();
    window.localStorage.clear();
    settings.baseSpeed = 1;
    settings.gridLines = false;
    settings.gridSize = 30;
  });
  // `vi.spyOn` installs accessor descriptors on the targets it patches,
  // which blocks plain assignment (e.g. `globalThis.requestAnimationFrame
  // = ...` inside captureRAF). Restoring keeps each test independent.
  afterEach(() => {
    vi.restoreAllMocks();
  });
}

/**
 * Construct an Engine (or subclass) with sane test defaults and
 * auto-destroy it when the current test finishes -- guaranteed even on
 * assertion failure. Returns the instance.
 *
 * @template {typeof Engine} T
 * @param {T} [GameClass=Engine]  Engine or any subclass.
 * @param {ConstructorParameters<T>[1]} [opts]
 * @returns {InstanceType<T>}
 */
export function createEngine(GameClass = Engine, opts) {
  const instance = new GameClass(makeCanvas(), { cols: 10, rows: 10, ...opts });
  onTestFinished(() => instance.destroy());
  return instance;
}

/**
 * Replace `requestAnimationFrame` with a manual driver so tests can
 * control loop timing without real wall-clock waits. Returns a `tick`
 * function that invokes the most recently registered RAF callback with
 * the given timestamp. Originals are restored when the test finishes.
 *
 * @returns {{ tick: (now?: number) => void }}
 */
export function captureRAF() {
  let pending = null;
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;

  globalThis.requestAnimationFrame = (cb) => {
    pending = cb;
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {};

  onTestFinished(() => {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancel;
  });

  return {
    tick: (now = performance.now()) => pending?.(now),
  };
}

/**
 * Run `fn` with `vi.useFakeTimers()` active, restoring real timers in
 * a `finally` block so a failing assertion can't strand fake timers
 * across tests. Forwards the function's return value.
 *
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function withFakeTimers(fn) {
  vi.useFakeTimers();
  try {
    return fn();
  } finally {
    vi.useRealTimers();
  }
}

/** Dispatch a `keydown` event with the given `KeyboardEvent.code`. */
export const dispatchKey = (code, init = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { code, ...init }));

/**
 * Fire a single touch event of `type` at `point` on `target`. happy-dom
 * lacks the `Touch`/`TouchEvent` constructors, so a plain cancelable
 * `Event` is decorated with `changedTouches`. Pass an array to model
 * fingers moving or lifting together. Extra touch fields can use `init`.
 *
 * @param {EventTarget} target
 * @param {'touchstart' | 'touchend' | 'touchcancel' | 'touchmove'} type
 * @param {{ x: number, y: number, identifier?: number } | { x: number, y: number, identifier?: number }[]} point
 * @param {Record<string, unknown>} [init]
 */
export function dispatchTouchEvent(target, type, point, init = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const points = Array.isArray(point) ? point : [point];
  event.changedTouches = points.map(({ x, y, ...fields }) => ({
    clientX: x,
    clientY: y,
    identifier: 0,
    ...init,
    ...fields,
  }));
  target.dispatchEvent(event);
  return event;
}

/**
 * Simulate a complete touch gesture on `target`: a `touchstart` at
 * `start` followed by a `touchend` at `end`. Points are `{ x, y }` in CSS
 * pixels, matching the coordinate space of `getBoundingClientRect`.
 * Defaults to a tap in place (`end === start`). For press-and-hold
 * gestures, drive `dispatchTouchEvent` directly.
 *
 * @param {EventTarget} target      Usually the engine canvas.
 * @param {{ x: number, y: number }} start
 * @param {{ x: number, y: number }} [end=start]
 */
export function dispatchTouch(target, start, end = start) {
  dispatchTouchEvent(target, 'touchstart', start);
  dispatchTouchEvent(target, 'touchend', end);
}
