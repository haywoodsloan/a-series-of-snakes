import { expect, test } from '@playwright/test';

// Every game route runs the same smoke: canvas renders, tab title is
// set, BACK navigates home, keyboard input is accepted. Adding a new
// game is a one-line addition to GAMES below.

const GAMES = [
  'classic',
  'chase',
  'tunnels',
  'spikes',
  'endless',
  'mirror',
  'duo',
  'inverted',
];

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

for (const game of GAMES) {
  test(`/${game}: renders canvas, sets tab title, and BACK returns home`, async ({ page }) => {
    await page.goto(`/${game}`);
    await expect(page.locator('canvas.game-canvas')).toBeVisible();
    await expect(page).toHaveTitle(new RegExp(`A Series of Snakes \\| ${capitalize(game)}`));

    // Drive keyboard input -- the engine listens on window keydown, so
    // any focused element on the page works as the dispatch target.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');

    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'A SERIES OF SNAKES' })).toBeVisible();
  });
}

test('unknown game routes redirect to home', async ({ page }) => {
  await page.goto('/not-a-real-game');
  await expect(page.getByRole('heading', { name: 'A SERIES OF SNAKES' })).toBeVisible();
});
