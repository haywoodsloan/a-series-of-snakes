// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GamePage from '../../pages/[game].vue';
import { captureRAF, installCanvasStubs } from '../helpers/engine.js';
import { highScoreKey } from '../helpers/storage.js';

beforeEach(() => {
  installCanvasStubs();
  window.localStorage.clear();
  // The engine's RAF loop is irrelevant to these structural tests.
  // `captureRAF` swaps in a manual driver (which we never tick), so
  // the loop is effectively disabled and restored when the test ends.
  captureRAF();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

/** Construct a game-over event payload with sane defaults. */
const gameOverDetail = (overrides = {}) => ({
  engine: {},
  score: 0,
  gameKey: 'classic:g30:s1',
  qualifies: false,
  ...overrides,
});

/**
 * Mount the page, wait for its async setup to complete (route watch ->
 * dynamic game-module import -> startGame -> instance.start), and
 * return the wrapper. After this, the canvas has its `gameover` listener.
 *
 * The dynamic `import()` in `games/index.js` is a real Vite-resolved
 * module load, which doesn't drain through the microtask queue
 * synchronously. A short real-time wait is more reliable than
 * `flushPromises` alone.
 */
async function mountGame(route) {
  const wrapper = await mountSuspended(GamePage, { route });
  await new Promise((r) => setTimeout(r, 250));
  await flushPromises();
  return wrapper;
}

/** Dispatch the engine's `gameover` CustomEvent on the page's canvas. */
const fireGameOver = (wrapper, detail) =>
  wrapper
    .find('canvas.game-canvas')
    .element.dispatchEvent(new CustomEvent('gameover', { detail }));

describe('Pages: [game].vue', () => {
  it('renders the canvas for a known game route with no overlay', async () => {
    const wrapper = await mountGame('/classic');
    expect(wrapper.find('canvas.game-canvas').exists()).toBe(true);
    expect(wrapper.find('.overlay').exists()).toBe(false);
  });

  it('shows GAME OVER overlay + PLAY AGAIN when score is 0', async () => {
    const wrapper = await mountGame('/classic');
    fireGameOver(wrapper, gameOverDetail({ score: 0 }));
    await flushPromises();

    expect(wrapper.find('.overlay').exists()).toBe(true);
    expect(wrapper.text()).toContain('GAME OVER');
    expect(wrapper.find('.name-entry').exists()).toBe(false);
    expect(wrapper.text()).toContain('PLAY AGAIN');
  });

  it('prompts for initials when score > 0 (submit disabled until 3 chars)', async () => {
    const wrapper = await mountGame('/classic');
    fireGameOver(wrapper, gameOverDetail({ score: 5, qualifies: true }));
    await flushPromises();

    expect(wrapper.find('.name-entry').exists()).toBe(true);
    expect(wrapper.find('#initials-input').exists()).toBe(true);
    expect(
      wrapper.find('form.name-entry button[type="submit"]').attributes('disabled')
    ).toBeDefined();
  });

  it('sanitizes initials input (uppercase A-Z, max 3 chars)', async () => {
    const wrapper = await mountGame('/classic');
    fireGameOver(wrapper, gameOverDetail({ score: 5, qualifies: true }));
    await flushPromises();

    const input = wrapper.find('#initials-input');
    await input.setValue('a1b2c3d');

    expect(input.element.value).toBe('ABC');
  });

  it('parses the scoreboard category caption from a namespaced gameKey', async () => {
    // The category caption only renders when the scoreboard is
    // non-empty, so seed one entry under the bucket first.
    window.localStorage.setItem(
      highScoreKey('classic:g50:s2'),
      JSON.stringify([{ name: 'AAA', score: 1 }])
    );

    const wrapper = await mountGame('/classic');
    fireGameOver(wrapper, gameOverDetail({ gameKey: 'classic:g50:s2' }));
    await flushPromises();

    const caption = wrapper.find('.scoreboard-category');
    expect(caption.exists()).toBe(true);
    expect(caption.text()).toContain('GRID 50');
    expect(caption.text()).toContain('SPEED 2');
  });

  it('redirects unknown game routes to / (overlay never appears)', async () => {
    const wrapper = await mountSuspended(GamePage, { route: '/not-a-real-game' });
    await flushPromises();
    expect(wrapper.find('.overlay').exists()).toBe(false);
  });
});
