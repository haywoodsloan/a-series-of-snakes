import { expect, test } from '../helpers/visual-test.js';

// SettingsDialog overlay. Opened via the SETTINGS button on the home page.

test('settings dialog open', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: /SETTINGS/i })).toBeVisible();

  await expect(page).toHaveScreenshot('settings-dialog.png');
});
