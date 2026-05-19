// Shared DOM stubs + factory helpers for unit + integration tests that
// exercise the Engine (or any Engine subclass). happy-dom and the Nuxt
// vitest environment don't implement Canvas 2D, Path2D, or ResizeObserver,
// and have no useful layout for `getBoundingClientRect`.
//
// All draw operations are no-ops -- these tests verify game state, not
// pixel output. Visual correctness is owned by the Playwright visual
// regression suite under tests/visual/.
import { afterEach, beforeEach, onTestFinished, vi } from 'vitest';

import Engine from '../../games/engine.js';

class FakeContext2D {
  fillRect() {}
  clearRect() {}
  fillText() {}
  strokeRect() {}
  stroke() {}
  fill() {}
  save() {}
  restore() {}
  // Setter-only properties on the real CanvasRenderingContext2D --
  // declared explicitly so test code can spy on `ctx.fillStyle = ...`
  // assignments without throwing.
  set fillStyle(_) {}
  set strokeStyle(_) {}
  set lineWidth(_) {}
  set shadowColor(_) {}
  set shadowBlur(_) {}
  set globalAlpha(_) {}
  set font(_) {}
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

const CANVAS_RECT = Object.freeze({
  x: 0,
  y: 0,
  width: 400,
  height: 400,
  top: 0,
  left: 0,
  right: 400,
  bottom: 400,
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
    getBoundingClientRect: vi.fn(() => CANVAS_RECT),
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
 * Standard `beforeEach` / `afterEach` block for any unit or integration
 * test that drives an Engine: install canvas stubs, reset
 * localStorage, and restore mocks/spies after every test. Call once at
 * the top of the file.
 */
export function setupEngineTest() {
  beforeEach(() => {
    installCanvasStubs();
    window.localStorage.clear();
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

/** Dispatch a `keydown` event with the given `KeyboardEvent.code`. */
export const dispatchKey = (code, init = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { code, ...init }));
