import { expect, test } from '@playwright/test';
import { seedRandom, waitForFontsReady } from '../helpers/playwright.js';

// Game page chrome + rendered canvas. Snake/food spawn positions are
// deterministic because beforeEach pins Math.random, so the canvas
// pixels are reproducible. Baseline lives at game-chrome.png.

test.beforeEach(async ({ page }) => {
  await seedRandom(page);
});

test('game page with rendered canvas', async ({ page }) => {
  await page.goto('/classic');
  await waitForFontsReady(page);

  // Wait for the engine's RAF loop to paint at least one frame. With
  // Math.random pinned, the result is deterministic; this poll just
  // guards against snapping before the first draw lands.
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas.game-canvas');
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    const { data } = ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1);
    return data[3] !== 0;
  });

  await expect(page).toHaveScreenshot('game-chrome.png');
});
