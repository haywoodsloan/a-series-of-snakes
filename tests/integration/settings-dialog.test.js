// @vitest-environment nuxt
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import SettingsDialog from '~/components/SettingsDialog.vue';
import { settings } from '~/utils/settings.js';

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
        (w) =>
          w.find('.settings-backdrop').trigger('keydown', { key: 'Escape' }),
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

    it('steps grid size via the stepper buttons', async () => {
      settings.gridSize = 30;
      const wrapper = await mountDialog();
      // First row = speed steppers, second row = grid-size steppers.
      const steps = wrapper.findAll('.step');
      const [gridDec, gridInc] = [steps[2], steps[3]];

      await gridInc.trigger('click');
      expect(settings.gridSize).toBe(50);

      await gridDec.trigger('click');
      expect(settings.gridSize).toBe(30);
    });

    it('disables the increase buttons when both settings are at their max', async () => {
      settings.baseSpeed = 2; // SPEED_OPTIONS max
      settings.gridSize = 100; // GRID_SIZE_OPTIONS max
      const wrapper = await mountDialog();
      const steps = wrapper.findAll('.step');
      // [speedDec, speedInc, gridDec, gridInc]
      expect(steps[1].attributes('disabled')).toBeDefined();
      expect(steps[3].attributes('disabled')).toBeDefined();
    });

    it('clamps stepSpeed/stepGridSize at the array bounds', async () => {
      settings.baseSpeed = 2;
      settings.gridSize = 100;
      const wrapper = await mountDialog();
      const steps = wrapper.findAll('.step');

      // Trigger the disabled-branch click anyway (jsdom honors @click
      // even on `:disabled` elements when fired programmatically); the
      // setter must clamp rather than overflow.
      await steps[1].trigger('click');
      await steps[3].trigger('click');

      expect(settings.baseSpeed).toBe(2);
      expect(settings.gridSize).toBe(100);
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

    it('Tab keydown with no visible focusables refocuses the panel', async () => {
      // happy-dom reports `offsetParent` as null for every element, so
      // `getFocusable()` returns an empty list and the handler takes
      // the preventDefault + panel.focus() branch.
      const wrapper = await mountDialog();
      await flushPromises();
      const panel = wrapper.find('.settings-panel');
      await panel.trigger('keydown', { key: 'Tab' });
      await panel.trigger('keydown', { key: 'Tab', shiftKey: true });
    });

    it('Tab and Shift+Tab wrap focus when buttons are visible', async () => {
      // Force `offsetParent` to a truthy value so `getFocusable()` returns
      // the real button list and the handler walks its wrap branches.
      const desc = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        'offsetParent'
      );
      Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
        configurable: true,
        get() {
          return document.body;
        },
      });
      try {
        const wrapper = await mountDialog();
        await flushPromises();
        const panel = wrapper.find('.settings-panel');
        const buttons = panel.findAll('button');
        const first = buttons[0].element;
        const last = buttons.at(-1).element;
        const firstFocus = vi.spyOn(first, 'focus');
        const lastFocus = vi.spyOn(last, 'focus');

        // Pretend the last button is the active element -- Tab should
        // wrap to the first (call first.focus()).
        Object.defineProperty(document, 'activeElement', {
          configurable: true,
          get: () => last,
        });
        await panel.trigger('keydown', { key: 'Tab' });
        expect(firstFocus).toHaveBeenCalled();

        // Pretend the first button is active -- Shift+Tab wraps to last.
        Object.defineProperty(document, 'activeElement', {
          configurable: true,
          get: () => first,
        });
        await panel.trigger('keydown', { key: 'Tab', shiftKey: true });
        expect(lastFocus).toHaveBeenCalled();

        // Pretend the panel itself is active -- Shift+Tab also wraps to
        // last (the `active === panelRef.value` branch).
        Object.defineProperty(document, 'activeElement', {
          configurable: true,
          get: () => panel.element,
        });
        lastFocus.mockClear();
        await panel.trigger('keydown', { key: 'Tab', shiftKey: true });
        expect(lastFocus).toHaveBeenCalled();
      } finally {
        delete document.activeElement;
        if (desc) {
          Object.defineProperty(HTMLElement.prototype, 'offsetParent', desc);
        } else {
          delete HTMLElement.prototype.offsetParent;
        }
      }
    });

    it('restores focus to the previously-focused element when reopen->close', async () => {
      const trigger = document.createElement('button');
      document.body.appendChild(trigger);
      trigger.focus();

      // Mount closed so the open watcher actually fires on the
      // false->true transition and captures `previouslyFocused`.
      const wrapper = await mountDialog(false);
      await wrapper.setProps({ modelValue: true });
      await flushPromises();
      await nextTick();

      await wrapper.setProps({ modelValue: false });
      await flushPromises();
      await nextTick();

      expect(document.activeElement).toBe(trigger);
      trigger.remove();
    });
  });
});
