import { expect, test } from '@playwright/test';

// Each Playwright test gets a fresh browser context, so localStorage is
// already isolated between tests -- no manual clear needed.

const SETTINGS_DIALOG = { name: /SETTINGS/i };

test('settings persist across a page reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', SETTINGS_DIALOG);

  // Flip grid lines on; the button text mirrors the new value.
  await dialog.getByRole('button', { name: /HIDDEN/ }).click();
  await expect(dialog.getByRole('button', { name: /SHOWN/ })).toBeVisible();

  await dialog.getByRole('button', { name: /BACK/i }).click();
  await page.reload();

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(
    page.getByRole('dialog', SETTINGS_DIALOG).getByRole('button', { name: /SHOWN/ })
  ).toBeVisible();
});

test('Esc closes the dialog and returns focus to the trigger', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Settings' });
  await trigger.click();
  const dialog = page.getByRole('dialog', SETTINGS_DIALOG);
  await expect(dialog).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('Tab keeps focus trapped inside the dialog panel', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', SETTINGS_DIALOG)).toBeVisible();

  // The dialog has ~6 focusable buttons; tabbing through 12 times
  // should loop the focus at least once without escaping the panel.
  const focusInsidePanel = () =>
    page.evaluate(() =>
      document.querySelector('.settings-panel')?.contains(document.activeElement) ?? false
    );

  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await focusInsidePanel()).toBe(true);
  }
});
