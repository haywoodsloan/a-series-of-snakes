import { expect, test } from '@playwright/test';

import {
  meanPixelDifference,
  seedRandom,
  waitForFontsReady,
} from '../helpers/playwright.js';
import { STORAGE_KEY_SETTINGS } from '../helpers/storage.js';

test.use({ contextOptions: { reducedMotion: 'no-preference' } });
test.beforeEach(async ({ page }) => {
  await seedRandom(page);
});

async function openFlickerControl(page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const toggle = page.getByRole('button', { name: 'CRT Flicker', exact: true });
  await expect(toggle).toBeVisible();
  return toggle;
}

async function expectStopped(page, { screenOnly = false } = {}) {
  const names = await page
    .locator('.crt')
    .evaluate(
      (root, screenOnly) =>
        (screenOnly ? [root] : [root, ...root.querySelectorAll('*')])
          .flatMap((el) =>
            [null, '::before', '::after'].map(
              (pseudo) => getComputedStyle(el, pseudo).animationName
            )
          )
          .filter((name) => name !== 'none'),
      screenOnly
    );
  expect(names).toEqual([]);
}

test('CRT Flicker replaces glow and the menu has no footer subtext', async ({
  page,
}) => {
  await page.goto('/', { timeout: 15_000 });
  const toggle = await openFlickerControl(page);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toHaveText('OFF');
  await expect(page.getByRole('dialog')).toContainText('CRT FLICKER');
  await expect(
    page.getByRole('button', { name: 'CRT glow', exact: true })
  ).toHaveCount(0);
  await expect(page.locator('.settings-panel p')).toHaveCount(0);
  await expectStopped(page, { screenOnly: true });
});

test('TV static keeps animating independently of the CRT Flicker toggle', async ({
  page,
}) => {
  await page.goto('/', { timeout: 15_000 });
  const preview = page.locator('.preview.empty').first();
  await expect(preview).toHaveCSS('animation-name', /^snow/);
  await expect(preview.locator('.trace')).toHaveCSS('animation-name', /^trace/);
  await expectStopped(page, { screenOnly: true });
  const animations = await preview.evaluateHandle((el) =>
    el.getAnimations({ subtree: true })
  );
  const before = await animations.evaluate((items) =>
    items.map((animation) => animation.currentTime)
  );
  expect(before).toHaveLength(2);

  const toggle = await openFlickerControl(page);
  await toggle.click();
  await expect(page.locator('.crt')).toHaveClass(/crt-flicker/);
  await toggle.click();
  await expect(toggle).toHaveText('OFF');
  await expectStopped(page, { screenOnly: true });
  expect(
    await animations.evaluate((items) =>
      items.map((animation) => animation.playState)
    )
  ).toEqual(['running', 'running']);
  const after = await animations.evaluate((items) =>
    items.map((animation) => animation.currentTime)
  );
  after.forEach((time, index) => expect(time).toBeGreaterThan(before[index]));
  await animations.dispose();

  await page.getByRole('dialog').getByRole('button', { name: /BACK/i }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.mouse.move(0, 0);
  await waitForFontsReady(page);
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      animation.pause();
      animation.currentTime = 0;
    }
  });
  const first = await preview.screenshot({
    animations: 'allow',
    timeout: 5000,
  });
  await preview.evaluate((el) => {
    const [snow] = el.getAnimations();
    snow.currentTime = snow.effect.getComputedTiming().duration / 2;
  });
  const second = await preview.screenshot({
    animations: 'allow',
    timeout: 5000,
  });
  expect(second.equals(first)).toBe(false);
});

test('flicker opt-in persists across reloads and game navigation and switches off immediately', async ({
  page,
}) => {
  await page.goto('/', { timeout: 15_000 });
  await (await openFlickerControl(page)).click();
  await page.reload({ timeout: 15_000 });
  await expect(page.locator('a.preview').first()).toBeVisible();
  const flickerName = () =>
    page
      .locator('.crt')
      .evaluate((el) => getComputedStyle(el, '::after').animationName);
  expect(await flickerName()).toMatch(/^flicker/);
  for (const game of ['classic', 'mirror', 'rpg']) {
    await page.goto(`/${game}`, { timeout: 15_000 });
    await expect(page.locator('canvas.game-canvas')).toBeVisible();
    expect(await flickerName()).toMatch(/^flicker/);
  }
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await (await openFlickerControl(page)).click();
  await expectStopped(page, { screenOnly: true });
  await page.reload({ timeout: 15_000 });
  await expect(page.locator('a.preview').first()).toBeVisible();
  await expectStopped(page, { screenOnly: true });
});

test('flicker stays visible with gentler contrast and independent TV static', async ({
  page,
}) => {
  await page.goto('/', { timeout: 15_000 });
  await (await openFlickerControl(page)).click();
  await page.getByRole('dialog').getByRole('button', { name: /BACK/i }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.mouse.move(0, 0);
  await waitForFontsReady(page);

  const effects = await page.locator('.crt').evaluate((root) => {
    const jitter = getComputedStyle(root);
    const flicker = getComputedStyle(root, '::after');
    const snow = getComputedStyle(root.querySelector('.preview.empty'));
    const trace = getComputedStyle(root.querySelector('.preview.empty .trace'));
    return {
      jitter: {
        name: jitter.animationName,
        duration: jitter.animationDuration,
      },
      flicker: {
        name: flicker.animationName,
        duration: flicker.animationDuration,
        background: flicker.backgroundColor,
        blend: flicker.mixBlendMode,
        shadow: flicker.boxShadow,
        pointerEvents: flicker.pointerEvents,
      },
      snow: snow.animationName,
      trace: trace.animationName,
    };
  });
  expect(effects.jitter.name).toMatch(/^hsync-jitter/);
  expect(effects.jitter.duration).toBe('2.4s');
  expect(effects.flicker.name).toMatch(/^flicker/);
  expect(effects.flicker.duration).toBe('0.15s');
  expect(effects.flicker.background).toMatch(/^rgba\(28, 22, 18, [\d.]+\)$/);
  expect(effects.flicker.blend).toBe('multiply');
  expect(effects.flicker.shadow).toBe('none');
  expect(effects.flicker.pointerEvents).toBe('none');
  expect(effects.snow).toMatch(/^snow/);
  expect(effects.trace).toMatch(/^trace/);

  // Freeze all other effects so different center pixels prove this is
  // the full-screen flicker, not the removed edge-only glow.
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      animation.pause();
      animation.currentTime = 0;
    }
  });
  const box = await page.locator('.crt').boundingBox();
  const clip = {
    x: box.x + box.width * 0.2,
    y: box.y + box.height * 0.2,
    width: box.width * 0.6,
    height: box.height * 0.6,
  };
  const capturePhase = async (time) => {
    await page.evaluate(
      ({ name, time }) => {
        document
          .getAnimations()
          .find((animation) => animation.animationName === name).currentTime =
          time;
      },
      { name: effects.flicker.name, time }
    );
    return page.screenshot({ clip, animations: 'allow', timeout: 5000 });
  };
  const dark = await capturePhase(75);
  const light = await capturePhase(82.5);
  const subtle = await meanPixelDifference(page, dark, light);

  // Compare the same frozen scene with the previously deployed intensity.
  await page.addStyleTag({
    content:
      '.crt.crt-flicker::after { background: rgba(28, 22, 18, 0.12) !important; }',
  });
  const original = await meanPixelDifference(
    page,
    await capturePhase(75),
    await capturePhase(82.5)
  );
  const ratio = subtle / original;
  console.log('Flicker pixel modulation:', { subtle, original, ratio });
  expect(subtle).toBeGreaterThan(0.5);
  expect(ratio).toBeGreaterThan(0.6);
  expect(ratio).toBeLessThan(0.9);
});

test('reduced motion pauses every CRT effect without losing the saved opt-in', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { timeout: 15_000 });
  const toggle = await openFlickerControl(page);
  await toggle.click();
  await expect(toggle.getByText('PAUSED', { exact: true })).toBeVisible();
  await expectStopped(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(toggle.getByText('ON', { exact: true })).toBeVisible();
  expect(
    await page
      .locator('.crt')
      .evaluate((el) => getComputedStyle(el, '::after').animationName)
  ).toMatch(/^flicker/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expectStopped(page);
  await toggle.click();
  await expect(toggle).toHaveText('OFF');
  await expectStopped(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expectStopped(page, { screenOnly: true });
  await expect(page.locator('.preview.empty').first()).toHaveCSS(
    'animation-name',
    /^snow/
  );
  await expect(page.locator('.preview.empty .trace').first()).toHaveCSS(
    'animation-name',
    /^trace/
  );
});

test('an old glow preference does not automatically enable the stronger flicker', async ({
  page,
}) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({ crtGlow: true, gridSize: 75 }));
  }, STORAGE_KEY_SETTINGS);
  await page.goto('/', { timeout: 15_000 });
  const toggle = await openFlickerControl(page);
  await expect(toggle).toHaveText('OFF');
  await expect(page.getByRole('dialog').locator('.value').nth(1)).toHaveText(
    '75X75'
  );
  await expectStopped(page, { screenOnly: true });
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 844, height: 320 },
]) {
  test(`the renamed control and clean menu fit ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/', { timeout: 15_000 });
    await waitForFontsReady(page);
    const toggle = await openFlickerControl(page);
    await toggle.click();
    const panel = page.locator('.settings-panel');
    const box = await panel.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    const { scrollWidth, clientWidth } = await panel.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    expect(
      await page
        .locator('.settings-label')
        .last()
        .evaluate(
          (el) => el.offsetHeight <= parseFloat(getComputedStyle(el).lineHeight)
        )
    ).toBe(true);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /BACK/i })
      .click();
    await expect(page.getByRole('dialog')).toBeHidden();
  });
}
