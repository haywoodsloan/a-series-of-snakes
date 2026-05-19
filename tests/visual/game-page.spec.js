import { expect, test } from '../helpers/visual-test.js';

// Game page chrome + rendered canvas. Snake/food spawn positions are
// deterministic because the visual-test fixture seeds Math.random, so
// the canvas pixels are reproducible.

test('game page with rendered canvas', async ({ page }) => {
  await page.goto('/classic');

  // Wait for the engine's RAF loop to paint at least one frame. With
  // Math.random pinned, the result is deterministic; this poll just
  // guards against snapping before the first draw lands.
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas.game-canvas');
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    const { data } = ctx.getImageData(
      canvas.width / 2,
      canvas.height / 2,
      1,
      1
    );
    return data[3] !== 0;
  });

  await expect(page).toHaveScreenshot('game-chrome.png');
});
