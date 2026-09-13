import { expect, test } from '@playwright/test';

import { waitForFontsReady } from '../helpers/playwright.js';

test.use({ contextOptions: { reducedMotion: 'no-preference' } });

async function openGlowControl(page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const toggle = page.getByRole('button', { name: 'CRT glow', exact: true });
  await expect(toggle).toBeVisible();
  return toggle;
}

async function glowStyle(page) {
  return page.locator('.crt').evaluate((el) => {
    const style = getComputedStyle(el, '::after');
    return {
      animation: style.animationName,
      duration: parseFloat(style.animationDuration),
      timing: style.animationTimingFunction,
      background: style.backgroundColor,
      shadow: style.boxShadow,
      pointerEvents: style.pointerEvents,
    };
  });
}

async function frameDifference(page, first, second) {
  return page.evaluate(
    async ({ first, second }) => {
      const decode = async (base64) => {
        const image = await createImageBitmap(
          await (await fetch(`data:image/png;base64,${base64}`)).blob()
        );
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        image.close();
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
      };
      const a = await decode(first);
      const b = await decode(second);
      let edgePixels = 0;
      let edgeTotal = 0;
      let edgeMax = 0;
      let centerChanged = 0;
      let centerMax = 0;
      for (let y = 0; y < a.height; y++) {
        for (let x = 0; x < a.width; x++) {
          const i = (y * a.width + x) * 4;
          const delta = Math.max(
            Math.abs(a.data[i] - b.data[i]),
            Math.abs(a.data[i + 1] - b.data[i + 1]),
            Math.abs(a.data[i + 2] - b.data[i + 2])
          );
          if (x < 32 || x >= a.width - 32 || y < 32 || y >= a.height - 32) {
            edgePixels++;
            edgeTotal += delta;
            edgeMax = Math.max(edgeMax, delta);
          }
          if (
            x > a.width * 0.2 &&
            x < a.width * 0.8 &&
            y > a.height * 0.2 &&
            y < a.height * 0.8 &&
            delta
          ) {
            centerChanged++;
            centerMax = Math.max(centerMax, delta);
          }
        }
      }
      return {
        edgeMean: edgeTotal / edgePixels,
        edgeMax,
        centerChanged,
        centerMax,
      };
    },
    { first: first.toString('base64'), second: second.toString('base64') }
  );
}

test('CRT glow is off by default and can be explicitly enabled, persisted and disabled', async ({
  page,
}) => {
  await page.goto('/', { timeout: 15_000 });
  const toggle = await openGlowControl(page);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect((await glowStyle(page)).animation).toBe('none');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.reload({ timeout: 15_000 });
  await expect(page.locator('a.preview').first()).toBeVisible();
  expect((await glowStyle(page)).animation).not.toBe('none');

  await page.getByRole('link', { name: /^classic$/i }).click();
  await expect(page.locator('canvas')).toBeVisible();
  expect((await glowStyle(page)).animation).not.toBe('none');
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await (await openGlowControl(page)).click();
  expect((await glowStyle(page)).animation).toBe('none');
  await page.reload({ timeout: 15_000 });
  await expect(page.locator('a.preview').first()).toBeVisible();
  expect((await glowStyle(page)).animation).toBe('none');
});

test('opted-in glow is slow, faint and confined to the edges', async ({
  page,
}) => {
  await page.goto('/', { timeout: 15_000 });
  await (await openGlowControl(page)).click();
  await page.getByRole('dialog').getByRole('button', { name: /BACK/i }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.mouse.move(0, 0);
  await waitForFontsReady(page);
  const style = await glowStyle(page);
  expect(style.animation).not.toBe('none');
  expect(style.duration).toBeGreaterThanOrEqual(12);
  expect(style.timing).toBe('ease-in-out');
  expect(style.background).toBe('rgba(0, 0, 0, 0)');
  expect(style.shadow).toContain('inset');
  const alpha = Number(
    /rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(style.shadow)?.[1]
  );
  expect(alpha).toBeGreaterThan(0);
  expect(alpha).toBeLessThanOrEqual(0.14);
  expect(style.pointerEvents).toBe('none');

  const frames = await page.locator('.crt').evaluate((el) => {
    const name = getComputedStyle(el, '::after').animationName;
    const animation = document
      .getAnimations()
      .find((a) => a.animationName === name);
    if (!animation) throw new Error('Expected the edge glow animation');
    animation.pause();
    animation.currentTime = 0;
    return animation.effect
      .getKeyframes()
      .map((frame) => Number(frame.opacity));
  });
  expect(Math.max(...frames)).toBeGreaterThan(0);
  expect(Math.max(...frames)).toBeLessThanOrEqual(0.65);
  expect(alpha * Math.max(...frames)).toBeLessThanOrEqual(0.1);
  expect(
    alpha * (Math.max(...frames) - Math.min(...frames))
  ).toBeLessThanOrEqual(0.05);

  // At the darkest and brightest phases, the central screen must be
  // pixel-identical: only the perimeter gets a glow.
  const box = await page.locator('.crt').boundingBox();
  const clip = {
    x: box.x + box.width * 0.2,
    y: box.y + box.height * 0.2,
    width: box.width * 0.6,
    height: box.height * 0.6,
  };
  const first = await page.screenshot({
    clip,
    animations: 'allow',
    timeout: 5000,
  });
  await page.locator('.crt').evaluate((el) => {
    const name = getComputedStyle(el, '::after').animationName;
    document.getAnimations().find((a) => a.animationName === name).currentTime =
      6000;
  });
  const second = await page.screenshot({
    clip,
    animations: 'allow',
    timeout: 5000,
  });
  expect(second.equals(first)).toBe(true);
});

test('reduced motion overrides an opt-in immediately', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { timeout: 15_000 });
  const toggle = await openGlowControl(page);
  await toggle.click();
  await expect(toggle.getByText('PAUSED', { exact: true })).toBeVisible();
  await expect(page.locator('#crt-glow-help')).toContainText('your device');
  expect((await glowStyle(page)).animation).toBe('none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(toggle.getByText('ON', { exact: true })).toBeVisible();
  await expect(toggle.getByText('PAUSED', { exact: true })).toBeHidden();
  expect((await glowStyle(page)).animation).not.toBe('none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(toggle.getByText('PAUSED', { exact: true })).toBeVisible();
  expect((await glowStyle(page)).animation).toBe('none');
  await toggle.click();
  await expect(toggle).toHaveText('OFF');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect((await glowStyle(page)).animation).toBe('none');
});

for (const viewport of [
  { width: 1300, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`glow produces visible edge pixels at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/', { timeout: 15_000 });
    await expect(page.locator('a.preview').first()).toBeVisible();
    await waitForFontsReady(page);
    await (await openGlowControl(page)).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /BACK/i })
      .click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.mouse.move(0, 0);
    const setPhase = (time) =>
      page.locator('.crt').evaluate((el, time) => {
        const name = getComputedStyle(el, '::after').animationName;
        const animation = document
          .getAnimations()
          .find((a) => a.animationName === name);
        if (!animation) throw new Error('Expected the edge glow animation');
        animation.pause();
        animation.currentTime = time;
      }, time);
    await setPhase(0);
    const dim = await page.screenshot({
      animations: 'allow',
      scale: 'css',
      timeout: 5000,
    });
    await setPhase(6000);
    const peak = await page.screenshot({
      path: test.info().outputPath('glow-peak.png'),
      animations: 'allow',
      scale: 'css',
      timeout: 5000,
    });
    await (await openGlowControl(page)).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /BACK/i })
      .click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.mouse.move(0, 0);
    const off = await page.screenshot({
      path: test.info().outputPath('glow-off.png'),
      animations: 'allow',
      scale: 'css',
      timeout: 5000,
    });
    const initial = await frameDifference(page, off, dim);
    const movement = await frameDifference(page, dim, peak);
    console.log(JSON.stringify({ viewport, initial, movement }));
    // Catch an enabled-but-invisible effect, including a fully dark start.
    expect(initial.edgeMean).toBeGreaterThanOrEqual(1);
    expect(movement.edgeMean).toBeGreaterThanOrEqual(1);
    expect(movement.edgeMax).toBeLessThanOrEqual(25);
    // Chromium can change color rounding when the effect layer is added.
    // During the actual animation, the center must remain pixel-identical.
    expect(initial.centerMax).toBeLessThanOrEqual(2);
    expect(movement.centerChanged).toBe(0);
  });
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 844, height: 320 },
]) {
  test(`glow settings remain reachable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/', { timeout: 15_000 });
    const toggle = await openGlowControl(page);
    await toggle.click();
    const panel = await page.locator('.settings-panel').boundingBox();
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.y).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(viewport.width);
    expect(panel.y + panel.height).toBeLessThanOrEqual(viewport.height);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /BACK/i })
      .click();
    await expect(page.getByRole('dialog')).toBeHidden();
  });
}
