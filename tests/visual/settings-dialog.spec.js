import { expect, test } from '@playwright/test';
import { seedRandom, waitForFontsReady } from '../helpers/playwright.js';

// SettingsDialog overlay. Opened via the SETTINGS button on the home
// page; baseline lives at settings-dialog.png.

test.beforeEach(async ({ page }) => {
  await seedRandom(page);
});

test('settings dialog open', async ({ page }) => {
  await page.goto('/');
  await waitForFontsReady(page);

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: /SETTINGS/i })).toBeVisible();

  await expect(page).toHaveScreenshot('settings-dialog.png');
});
