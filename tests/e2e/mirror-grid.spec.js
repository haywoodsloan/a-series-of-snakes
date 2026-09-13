import { expect, test } from '@playwright/test';

for (const { size, step, clicks } of [
  { size: 20, step: 'Decrease grid size', clicks: 1 },
  { size: 75, step: 'Increase grid size', clicks: 2 },
]) {
  test(`Mirror renders the selected ${size}x${size} grid`, async ({ page }) => {
    // Count the actual stroked grid lines, not injected engine state.
    await page.addInitScript(() => {
      const paths = new WeakMap();
      const moveTo = Path2D.prototype.moveTo;
      const lineTo = Path2D.prototype.lineTo;
      const stroke = CanvasRenderingContext2D.prototype.stroke;
      Path2D.prototype.moveTo = function (x, y) {
        const path = paths.get(this) ?? { vertical: 0, horizontal: 0 };
        path.x = x;
        path.y = y;
        paths.set(this, path);
        return moveTo.call(this, x, y);
      };
      Path2D.prototype.lineTo = function (x, y) {
        const path = paths.get(this);
        if (path) {
          if (x === path.x) path.vertical++;
          if (y === path.y) path.horizontal++;
        }
        return lineTo.call(this, x, y);
      };
      CanvasRenderingContext2D.prototype.stroke = function (...args) {
        const path = paths.get(args[0]);
        if (path && this.canvas.matches('.game-canvas')) {
          window.renderedGrid = {
            cols: path.vertical + 1,
            rows: path.horizontal + 1,
          };
        }
        return stroke.apply(this, args);
      };
    });

    await page.goto('/', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const dialog = page.getByRole('dialog');
    for (let i = 0; i < clicks; i++) {
      await dialog.getByRole('button', { name: step, exact: true }).click();
    }
    await expect(dialog.locator('.value').nth(1)).toHaveText(`${size}X${size}`);
    await dialog.getByRole('button', { name: 'HIDDEN', exact: true }).click();
    await dialog.getByRole('button', { name: /BACK/i }).click();
    await page.getByRole('link', { name: /^mirror$/i }).click();
    await expect(page.locator('canvas.game-canvas')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.renderedGrid), { timeout: 5000 })
      .toEqual({ cols: size, rows: size });
  });
}
