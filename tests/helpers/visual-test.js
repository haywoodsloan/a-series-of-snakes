// Custom Playwright `test` export for the visual regression suite.
// Wraps the default page fixture so every visual test gets:
//   1. a deterministic `Math.random` seed (spawn positions, snow
//      timings, etc. reproduce identically every run)
//   2. an extended `page.goto` that also waits for `document.fonts.ready`
//      -- text metrics jitter while webfonts are still loading, so every
//      visual assertion needs them resolved before snapping.
//
// Usage:
//   import { test, expect } from '../helpers/visual-test.js';
//   test('my visual assertion', async ({ page }) => {
//     await page.goto('/');
//     await expect(page).toHaveScreenshot('foo.png');
//   });
import { test as base, expect } from '@playwright/test';

import { seedRandom, waitForFontsReady } from './playwright.js';

export const test = base.extend({
  page: async ({ page }, use) => {
    await seedRandom(page);
    const originalGoto = page.goto.bind(page);
    page.goto = async (...args) => {
      const response = await originalGoto(...args);
      await waitForFontsReady(page);
      return response;
    };
    await use(page);
  },
});

export { expect };
