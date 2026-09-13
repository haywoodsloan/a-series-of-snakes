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
  expect(alpha).toBeLessThanOrEqual(0.04);
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
  expect(Math.max(...frames)).toBeLessThanOrEqual(0.4);
  expect(alpha * Math.max(...frames)).toBeLessThanOrEqual(0.016);

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
  await (await openGlowControl(page)).click();
  expect((await glowStyle(page)).animation).toBe('none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect((await glowStyle(page)).animation).not.toBe('none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect((await glowStyle(page)).animation).toBe('none');
});

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
