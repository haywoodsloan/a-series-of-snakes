import { expect, test } from '@playwright/test';

// Drives a deliberate crash in Endless mode (auto-grow, max speed,
// smallest grid) to exercise the full initials-entry -> scoreboard ->
// PLAY AGAIN flow. Settings are mutated via the dialog; each Playwright
// test starts in a fresh browser context, so the changes don't leak.

/** Click a stepper button until the locator reports disabled. */
async function clickUntilDisabled(locator, maxClicks = 10) {
  for (let i = 0; i < maxClicks; i++) {
    if (await locator.isDisabled()) return;
    await locator.click();
  }
}

test('crash in Endless prompts for initials, persists the score, and PLAY AGAIN restarts', async ({
  page,
}) => {
  // Make the crash happen quickly: max speed + smallest grid.
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: /SETTINGS/i });
  await clickUntilDisabled(dialog.getByRole('button', { name: /Increase speed/i }));
  await clickUntilDisabled(dialog.getByRole('button', { name: /Decrease grid size/i }));
  await dialog.getByRole('button', { name: /BACK/i }).click();

  await page.goto('/endless');
  await expect(page.locator('canvas.game-canvas')).toBeVisible();

  // Endless auto-grows by one cell per tick; on the smallest grid at
  // max speed, a straight line wraps into its own body in under 2s.
  await page.keyboard.press('ArrowRight');

  const overlay = page.getByRole('dialog', { name: /GAME OVER/i });
  await expect(overlay).toBeVisible({ timeout: 15_000 });

  // Initials entry: input focused, submit disabled until 3 chars.
  const input = page.locator('#initials-input');
  await expect(input).toBeFocused();
  const submit = page.getByRole('button', { name: 'ENTER' });
  await expect(submit).toBeDisabled();
  await input.type('abc'); // lowercase -- the page sanitizes to uppercase
  await expect(submit).toBeEnabled();
  await submit.click();

  // Scoreboard renders with the new entry.
  const scoreboard = page.getByRole('list', { name: /High scores/i });
  await expect(scoreboard).toBeVisible();
  await expect(scoreboard.getByText('ABC')).toBeVisible();

  // Focus jumps to PLAY AGAIN so keyboard users can restart instantly.
  const playAgain = page.getByRole('button', { name: 'PLAY AGAIN' });
  await expect(playAgain).toBeFocused();
  await playAgain.click();
  await expect(overlay).toBeHidden();
});
