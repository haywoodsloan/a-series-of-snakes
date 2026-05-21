// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import App from '~/app.vue';

describe('App shell', () => {
  it('home route: shows title, skip link, SETTINGS; hides BACK', async () => {
    const wrapper = await mountSuspended(App, { route: '/' });

    expect(wrapper.text()).toContain('A SERIES OF SNAKES');
    expect(wrapper.find('.skip-link').exists()).toBe(true);
    expect(wrapper.find('button.settings').exists()).toBe(true);
    expect(wrapper.find('a.back').exists()).toBe(false);
  });

  it('game route: shows BACK; hides SETTINGS', async () => {
    const wrapper = await mountSuspended(App, { route: '/classic' });

    expect(wrapper.find('a.back').exists()).toBe(true);
    expect(wrapper.find('button.settings').exists()).toBe(false);
  });

  it('clicking SETTINGS opens the dialog', async () => {
    const wrapper = await mountSuspended(App, { route: '/' });
    expect(wrapper.find('.settings-panel').exists()).toBe(false);

    await wrapper.find('button.settings').trigger('click');

    expect(wrapper.find('.settings-panel').exists()).toBe(true);
  });
});
