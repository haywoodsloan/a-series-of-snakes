import { expect, test } from '@playwright/test';

import { seedRandom, waitForFontsReady } from '../helpers/playwright.js';

const GAMES = [
  'classic',
  'chase',
  'tunnels',
  'spikes',
  'endless',
  'mirror',
  'duo',
  'inverted',
  'rpg',
];

async function expectNoDecorativeAnimations(page) {
  const animatedElements = await page.locator('.crt').evaluate((root) => {
    const animated = [];
    for (const el of [root, ...root.querySelectorAll('*')]) {
      for (const pseudo of [null, '::before', '::after']) {
        const style = getComputedStyle(el, pseudo);
        if (style.animationName !== 'none') {
          animated.push({
            element: el.className,
            pseudo,
            animation: style.animationName,
          });
        }
      }
    }
    return animated;
  });
  expect(animatedElements).toEqual([]);
}

for (const reducedMotion of ['no-preference', 'reduce']) {
  test.describe(`Steady screens with ${reducedMotion}`, () => {
    // Most existing tests emulate reduced motion, which hid the default
    // flicker. Exercise both preferences explicitly.
    test.use({ contextOptions: { reducedMotion } });
    test.beforeEach(async ({ page }) => {
      await seedRandom(page);
      expect(
        await page.evaluate(
          () => matchMedia('(prefers-reduced-motion: reduce)').matches
        )
      ).toBe(reducedMotion === 'reduce');
    });

    test('home keeps the retro texture without animated static or flicker', async ({
      page,
    }) => {
      await page.goto('/', { timeout: 15_000 });
      await expect(page.locator('.preview.empty').first()).toBeVisible();
      await waitForFontsReady(page);
      await expectNoDecorativeAnimations(page);

      expect(
        await page
          .locator('.crt')
          .evaluate((el) => getComputedStyle(el, '::before').backgroundImage)
      ).not.toBe('none');
      await expect(page.locator('.preview.empty').first()).not.toHaveCSS(
        'background-image',
        'none'
      );

      // Compare the actual rendered page, without Playwright disabling
      // animations as it normally does for visual snapshots.
      const first = await page.screenshot({
        animations: 'allow',
        timeout: 5000,
      });
      const second = await page.screenshot({
        animations: 'allow',
        timeout: 5000,
      });
      expect(second.equals(first)).toBe(true);
    });

    for (const game of GAMES) {
      test(`/${game} has no decorative screen animation`, async ({ page }) => {
        await page.goto(`/${game}`, { timeout: 15_000 });
        await expect(page.locator('canvas.game-canvas')).toBeVisible();
        await expectNoDecorativeAnimations(page);
      });
    }

    test('initials and the highlighted score stay visible without blinking', async ({
      page,
    }) => {
      await page.goto('/endless', { timeout: 15_000 });
      await expect(page.locator('canvas.game-canvas')).toBeVisible();
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('#initials-input')).toBeVisible({
        timeout: 10_000,
      });
      await expectNoDecorativeAnimations(page);
      await expect(page.locator('.initials-ghost .pending i')).toHaveCSS(
        'opacity',
        '1'
      );

      await page.locator('#initials-input').fill('ABC');
      await page.getByRole('button', { name: 'ENTER', exact: true }).click();
      await expect(page.locator('.scoreboard-row.current')).toBeVisible();
      await expectNoDecorativeAnimations(page);
      await expect(page.locator('.scoreboard-row.current')).toHaveCSS(
        'opacity',
        '1'
      );
    });

    if (reducedMotion === 'reduce') {
      test('reduced motion disables hover transitions instead of fast-forwarding them', async ({
        page,
      }) => {
        await page.goto('/', { timeout: 15_000 });
        const preview = page.getByRole('link', { name: 'classic' });
        await expect(preview).toBeVisible();
        await expect(preview).toHaveCSS('transition-duration', '0s');
        await preview.hover();
        expect(await preview.evaluate((el) => el.getAnimations().length)).toBe(
          0
        );
      });
    }
  });
}
