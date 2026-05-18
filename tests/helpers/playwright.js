// Shared Playwright helpers. Each Playwright `page` gets a fresh
// browser context per test, so localStorage is already isolated between
// tests; the helpers here only deal with *deterministic* setup so the
// app's client-side randomness and font loading don't make assertions
// flaky.

/**
 * Override Math.random with a deterministic Park-Miller LCG so the
 * app's random spawn positions, snow-animation timings, etc. reproduce
 * identically every run. Call from `test.beforeEach` before any
 * `page.goto`. The override is installed via `addInitScript`, so it
 * runs on every new document the test loads.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [seed=0xdeadbeef]
 */
export async function seedRandom(page, seed = 0xdeadbeef) {
  await page.addInitScript((seedValue) => {
    let state = seedValue;
    Math.random = () => {
      state = (state * 48271) % 0x7fffffff;
      return state / 0x7fffffff;
    };
  }, seed);
}

/**
 * Wait for the PublicPixel webfont (and any other declared fonts) to
 * finish loading before snapping. Text metrics jitter while fonts are
 * still loading.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function waitForFontsReady(page) {
  await page.evaluate(() => document.fonts.ready);
}
