// Shared DOM stubs + factory helpers for unit + integration tests that
// exercise the Engine (or any Engine subclass). happy-dom and the Nuxt
// vitest environment don't implement Canvas 2D, Path2D, or ResizeObserver,
// and have no useful layout for `getBoundingClientRect`.
//
// All draw operations are no-ops -- these tests verify game state, not
// pixel output. Visual correctness is owned by the Playwright visual
// regression suite under tests/e2e/visual.spec.js.

import { onTestFinished, vi } from 'vitest';
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
  set fillStyle(_v) {}
  set strokeStyle(_v) {}
  set lineWidth(_v) {}
  set shadowColor(_v) {}
  set shadowBlur(_v) {}
  set globalAlpha(_v) {}
  set font(_v) {}
  set textAlign(_v) {}
  set textBaseline(_v) {}
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
  const originals = {
    ResizeObserver: globalThis.ResizeObserver,
    Path2D: globalThis.Path2D,
    getContext: HTMLCanvasElement.prototype.getContext,
    getBoundingClientRect: HTMLCanvasElement.prototype.getBoundingClientRect,
  };

  globalThis.ResizeObserver = FakeResizeObserver;
  globalThis.Path2D = FakePath2D;
  HTMLCanvasElement.prototype.getContext = vi.fn(() => new FakeContext2D());
  HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(() => CANVAS_RECT);

  onTestFinished(() => {
    globalThis.ResizeObserver = originals.ResizeObserver;
    globalThis.Path2D = originals.Path2D;
    HTMLCanvasElement.prototype.getContext = originals.getContext;
    HTMLCanvasElement.prototype.getBoundingClientRect =
      originals.getBoundingClientRect;
  });
}

/** A detached canvas ready to hand to an Engine. */
export const makeCanvas = () => document.createElement('canvas');

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
