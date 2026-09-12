import { expect, test } from '../helpers/visual-test.js';

// Home page game selector with static CRT decoration.

test('home page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('home.png');
});
