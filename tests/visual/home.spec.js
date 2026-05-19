import { expect, test } from '@playwright/test';
import { seedRandom, waitForFontsReady } from '../helpers/playwright.js';

// Home page game selector. Baseline lives at home.png; the per-cell
// snow timings are deterministic because beforeEach pins Math.random.

test.beforeEach(async ({ page }) => {
  await seedRandom(page);
});

test('home page', async ({ page }) => {
  await page.goto('/');
  await waitForFontsReady(page);
  await expect(page).toHaveScreenshot('home.png');
});
