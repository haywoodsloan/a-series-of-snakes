import { expect, test } from '@playwright/test';
import { seedRandom, waitForFontsReady } from '../helpers/playwright.js';

// Visual regression. Baselines live under tests/e2e/screenshots/ and
// are platform-agnostic. Stability is enforced by:
//   - Animations disabled via the `toHaveScreenshot` config.
//   - Math.random seeded in beforeEach so spawn positions reproduce.
//   - Fonts awaited before snapping so text metrics are stable.

test.beforeEach(async ({ page }) => {
  await seedRandom(page);
});

test('home page', async ({ page }) => {
  await page.goto('/');
  await waitForFontsReady(page);
  await expect(page).toHaveScreenshot('home.png');
});

test('settings dialog open', async ({ page }) => {
  await page.goto('/');
  await waitForFontsReady(page);

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: /SETTINGS/i })).toBeVisible();

  await expect(page).toHaveScreenshot('settings-dialog.png');
});

test('game page with rendered canvas', async ({ page }) => {
  await page.goto('/classic');
  await waitForFontsReady(page);

  // Wait for the engine's RAF loop to paint at least one frame. With
  // Math.random pinned, spawn positions are deterministic; this poll
  // just guards against snapping before the first draw.
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas.game-canvas');
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    const { data } = ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1);
    return data[3] !== 0;
  });

  await expect(page).toHaveScreenshot('game-chrome.png');
});
