// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import SettingsDialog from '../../components/SettingsDialog.vue';
import { settings } from '../../utils/settings.js';

/**
 * Shorthand for `mountSuspended(SettingsDialog, ...)` with the open
 * prop. All tests in this file mount with `modelValue: true` unless
 * they need the watcher transition.
 */
const mountDialog = (modelValue = true) =>
  mountSuspended(SettingsDialog, { props: { modelValue } });

describe('SettingsDialog', () => {
  describe('rendering', () => {
    it('renders nothing when closed', async () => {
      const wrapper = await mountDialog(false);
      expect(wrapper.find('.settings-panel').exists()).toBe(false);
    });

    it('renders the panel and all three settings rows when opened', async () => {
      const wrapper = await mountDialog();
      const text = wrapper.text();
      expect(wrapper.find('.settings-panel').exists()).toBe(true);
      expect(text).toContain('SETTINGS');
      expect(text).toContain('BASE SPEED');
      expect(text).toContain('GRID SIZE');
      expect(text).toContain('GRID LINES');
    });
  });

  describe('dismiss', () => {
    it.each([
      ['BACK button click', (w) => w.find('.settings-close').trigger('click')],
      ['backdrop click', (w) => w.find('.settings-backdrop').trigger('click')],
      [
        'Escape key on backdrop',
        (w) => w.find('.settings-backdrop').trigger('keydown', { key: 'Escape' }),
      ],
    ])('emits update:modelValue=false on %s', async (_, act) => {
      const wrapper = await mountDialog();
      await act(wrapper);
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false]);
    });
  });

  describe('settings mutation', () => {
    it('toggles grid-lines on click', async () => {
      settings.gridLines = false;
      const wrapper = await mountDialog();

      await wrapper.find('.toggle').trigger('click');

      expect(settings.gridLines).toBe(true);
    });

    it('steps base speed via the stepper buttons', async () => {
      settings.baseSpeed = 1;
      const wrapper = await mountDialog();
      const [decrement, increment] = wrapper.findAll('.step');

      await increment.trigger('click');
      expect(settings.baseSpeed).toBe(2);

      await decrement.trigger('click');
      expect(settings.baseSpeed).toBe(1);
    });
  });

  describe('focus management', () => {
    // Layout-driven focus (`offsetParent` semantics) is unreliable in
    // jsdom/happy-dom -- the actual tab trap is verified by
    // tests/e2e/settings-persistence.spec.js. These tests exercise the
    // watcher branches for coverage.

    it('runs the open-watcher branch when the dialog opens', async () => {
      const wrapper = await mountDialog(false);
      await wrapper.setProps({ modelValue: true });
      await flushPromises();
      await nextTick();
      expect(wrapper.find('.settings-panel').exists()).toBe(true);
    });

    it('runs the close-watcher branch when the dialog closes', async () => {
      // Provide a real focused element so the watcher's else-branch
      // has something to attempt focus restoration on.
      const trigger = document.createElement('button');
      document.body.appendChild(trigger);
      trigger.focus();

      const wrapper = await mountDialog(true);
      await wrapper.setProps({ modelValue: false });
      await flushPromises();
      await nextTick();

      expect(wrapper.find('.settings-panel').exists()).toBe(false);
      trigger.remove();
    });

    it('ignores non-Tab keydowns on the panel without throwing', async () => {
      const wrapper = await mountDialog();
      await flushPromises();
      // Just trigger the handler -- the assertion is "does not throw".
      await wrapper.find('.settings-panel').trigger('keydown', { key: 'a' });
    });
  });
});
