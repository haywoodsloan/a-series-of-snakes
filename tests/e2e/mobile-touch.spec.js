import { expect, test } from '@playwright/test';

import { seedRandom, waitForFontsReady } from '../helpers/playwright.js';

const GAMES = [
  'classic',
  'chase',
  'tunnels',
  'spikes',
  'endless',
  'mirror',
  'duo',
  'inverted',
  'rpg',
];

test.use({ hasTouch: true });

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`${viewport.width}x${viewport.height} touch controls`, () => {
    test.use({ viewport, deviceScaleFactor: 3 });

    test('/rpg: combat rows are finger-sized and tapping selects the drawn action', async ({
      page,
    }) => {
      await seedRandom(page);
      await page.addInitScript(() => {
        window.combatLabels = {};
        const drawText = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (
          text,
          x,
          y,
          ...rest
        ) {
          if (['ATTACK', 'COUNTER', 'RUN'].includes(text)) {
            window.combatLabels[text] = { x, y, color: this.fillStyle };
          }
          return drawText.call(this, text, x, y, ...rest);
        };
      });
      await page.goto('/rpg', { timeout: 15_000 });
      const canvas = page.locator('canvas.game-canvas');
      await expect(canvas).toBeVisible();
      await waitForFontsReady(page);
      await page.clock.install();
      await page.clock.pauseAt(new Date(Date.now() + 500));
      const box = await canvas.boundingBox();
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

      // Advance real game ticks deterministically until an enemy catches
      // the straight-moving snake; no production state is injected.
      for (let i = 0; i < 40; i++) {
        await page.clock.runFor(500);
        if (await page.evaluate(() => !!window.combatLabels.RUN)) break;
      }
      await page.clock.runFor(1500);
      const rows = await canvas.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return Object.fromEntries(
          Object.entries(window.combatLabels).map(([name, label]) => [
            name,
            {
              x: rect.left + (label.x * rect.width) / el.width,
              y: rect.top + (label.y * rect.height) / el.height,
              color: label.color,
            },
          ])
        );
      });
      expect(rows.RUN).toBeDefined();
      // Ignore floating-point subtraction noise, not subpixel CSS scaling.
      expect(rows.COUNTER.y - rows.ATTACK.y).toBeGreaterThanOrEqual(44 - 1e-6);
      expect(rows.RUN.y - rows.COUNTER.y).toBeGreaterThanOrEqual(44 - 1e-6);
      await page.touchscreen.tap(rows.COUNTER.x + 10, rows.COUNTER.y);
      await page.clock.runFor(200);
      expect(await page.evaluate(() => window.combatLabels.COUNTER.color)).toBe(
        rows.ATTACK.color
      );
    });

    for (const game of GAMES) {
      test(`/${game}: a native tap starts play without scrolling`, async ({
        page,
      }) => {
        await seedRandom(page);
        await page.goto(`/${game}`, { timeout: 15_000 });
        const canvas = page.locator('canvas.game-canvas');
        await expect(canvas).toBeVisible();
        await waitForFontsReady(page);
        await expect(canvas).toHaveCSS('touch-action', 'none');
        const before = await canvas.evaluate((el) => el.toDataURL());
        const box = await canvas.boundingBox();

        await page.touchscreen.tap(
          box.x + box.width / 2,
          box.y + box.height * 0.2
        );
        await expect
          .poll(
            () =>
              canvas.evaluate(
                (el, pixels) => el.toDataURL() !== pixels,
                before
              ),
            { timeout: 3000 }
          )
          .toBe(true);
        expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(
          {
            x: 0,
            y: 0,
          }
        );
        await page.getByRole('link', { name: 'Back' }).click({ timeout: 5000 });
        await expect(page).toHaveURL(/\/$/);
      });
    }

    for (const game of GAMES.filter((name) => name !== 'rpg')) {
      test(`/${game}: a native swipe steers before release`, async ({
        page,
        browserName,
      }) => {
        test.skip(
          browserName !== 'chromium',
          'Native held gestures use Chromium CDP'
        );
        await seedRandom(page);
        await page.goto(`/${game}`, { timeout: 15_000 });
        const canvas = page.locator('canvas.game-canvas');
        await expect(canvas).toBeVisible();
        await waitForFontsReady(page);
        const before = await canvas.evaluate((el) => el.toDataURL());
        const box = await canvas.boundingBox();
        const client = await page.context().newCDPSession(page);
        const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        try {
          await client.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [point],
          });
          await client.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ ...point, y: point.y - 50 }],
          });
          await expect
            .poll(
              () =>
                canvas.evaluate(
                  (el, pixels) => el.toDataURL() !== pixels,
                  before
                ),
              { timeout: 3000 }
            )
            .toBe(true);
          expect(await page.evaluate(() => scrollY)).toBe(0);
        } finally {
          await client.send('Input.dispatchTouchEvent', {
            type: 'touchEnd',
            touchPoints: [],
          });
          await client.detach();
        }
      });
    }
  });
}
