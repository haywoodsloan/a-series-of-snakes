import { expect, test } from '../helpers/visual-test.js';

// Home page game selector. Per-cell snow timings are deterministic
// because the visual-test fixture seeds Math.random for every page.

test('home page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('home.png');
});
