// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import games from '~/games/index.js';
import IndexPage from '~/pages/index.vue';

const PAGE_SIZE = 12; // 4x3 grid as defined in pages/index.vue

describe('Home page game selector', () => {
  it('renders a preview tile for every game on the first page', async () => {
    const wrapper = await mountSuspended(IndexPage, { route: '/' });
    const tiles = wrapper.findAll('a.preview');

    expect(tiles).toHaveLength(Math.min(games.length, PAGE_SIZE));
    for (const game of games) {
      expect(wrapper.text().toUpperCase()).toContain(game.name.toUpperCase());
    }
  });

  it('links each tile to /<game-name>', async () => {
    const wrapper = await mountSuspended(IndexPage, { route: '/' });
    const hrefs = wrapper.findAll('a.preview').map((a) => a.attributes('href'));

    for (const game of games) {
      // Nuxt may prefix the configured baseURL; assert via containment.
      expect(hrefs.some((h) => h?.endsWith(`/${game.name}`))).toBe(true);
    }
  });

  it('disables the prev button on the first page', async () => {
    const wrapper = await mountSuspended(IndexPage, { route: '/' });
    expect(wrapper.find('button.prev').attributes('disabled')).toBeDefined();
  });

  it('next/prev buttons match the current page boundary', async () => {
    const wrapper = await mountSuspended(IndexPage, { route: '/' });
    // With <= PAGE_SIZE games the selector lives on a single page, so
    // both the prev and next buttons must report disabled. This pins
    // the boundary computation that the click handlers rely on.
    const prev = wrapper.find('button.prev');
    const next = wrapper.find('button.next');
    expect(prev.attributes('disabled')).toBeDefined();
    if (games.length <= PAGE_SIZE) {
      expect(next.attributes('disabled')).toBeDefined();
    } else {
      expect(next.attributes('disabled')).toBeUndefined();
      // Multi-page: click forward then back to exercise both handlers.
      await next.trigger('click');
      expect(
        wrapper.find('button.prev').attributes('disabled')
      ).toBeUndefined();
      await wrapper.find('button.prev').trigger('click');
      expect(wrapper.find('button.prev').attributes('disabled')).toBeDefined();
    }
  });
});
