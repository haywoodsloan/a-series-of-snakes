import { expect, test } from '@playwright/test';

import { waitForFontsReady } from '../helpers/playwright.js';

// Exercises the responsive layout at a typical phone viewport. The e2e
// projects pin a 1300x800 desktop viewport; override it here so these
// assertions run against the mobile breakpoints in the app's stylesheets.
const PHONE = { width: 390, height: 844 };

test.use({ viewport: PHONE });

// Small slack for sub-pixel rounding when comparing scroll vs client
// width. A genuine desktop-minimum overflow is hundreds of px, well clear
// of this, so the check still catches real regressions.
const OVERFLOW_SLACK = 2;

/** Horizontal overflow of the document in CSS px (0 == fits the width). */
function horizontalOverflow(page) {
  return page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
}

test('home page fits the phone width without horizontal scroll', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'A SERIES OF SNAKES' })
  ).toBeVisible();
  // The game picker is reachable and laid out within the viewport.
  await expect(page.getByRole('link', { name: 'classic' })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(OVERFLOW_SLACK);
});

test('game picker fits the phone height without vertical scroll', async ({
  page,
}) => {
  await page.goto('/');
  await waitForFontsReady(page);
  await expect(page.locator('a.preview').first()).toBeVisible();

  // The picker sizes each page to the number of preview rows that fit, so
  // it never needs to scroll. Wait for that fit-to-viewport measurement to
  // settle (it re-runs on fonts-ready), then confirm the pager -- the last
  // element on the page -- is on-screen and the document doesn't scroll.
  await page.waitForFunction(
    (slack) => {
      const controls = document.querySelector('.controls');
      if (!controls) return false;
      const el = document.documentElement;
      return (
        controls.getBoundingClientRect().bottom <= window.innerHeight + slack &&
        el.scrollHeight - el.clientHeight <= slack
      );
    },
    OVERFLOW_SLACK,
    { timeout: 5000 }
  );
});

test('game page canvas fills the viewport without horizontal scroll', async ({
  page,
}) => {
  await page.goto('/classic');
  const canvas = page.locator('canvas.game-canvas');
  await expect(canvas).toBeVisible();

  // Canvas spans essentially the full phone width so the playfield is as
  // large as possible.
  const box = await canvas.boundingBox();
  expect(box.width).toBeGreaterThan(PHONE.width * 0.9);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(OVERFLOW_SLACK);
});

test('settings dialog fits within the phone viewport', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();

  const panel = page.locator('.settings-panel');
  await expect(panel).toBeVisible();

  // The panel sits fully within the viewport horizontally -- the desktop
  // layout would overflow a phone with its 3.5rem side padding + 4rem
  // column gap.
  const box = await panel.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width + OVERFLOW_SLACK);
});
