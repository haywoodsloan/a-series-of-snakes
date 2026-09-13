// Shared Playwright helpers. Each Playwright `page` gets a fresh
// browser context per test, so localStorage is already isolated between
// tests; these helpers provide deterministic setup and rendered-pixel
// comparisons without extra image-processing dependencies.

/**
 * Override Math.random with a deterministic Park-Miller LCG so the
 * app's random spawn positions reproduce identically every run.
 * Call from `test.beforeEach` before any
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

/**
 * Mean absolute RGB-channel difference between equal-sized PNG screenshots.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Buffer} first
 * @param {Buffer} second
 */
export async function meanPixelDifference(page, first, second) {
  return page.evaluate(
    async (encoded) => {
      const frames = [];
      for (const png of encoded) {
        const image = new Image();
        image.src = `data:image/png;base64,${png}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Unable to decode screenshot pixels');
        context.drawImage(image, 0, 0);
        frames.push(context.getImageData(0, 0, image.width, image.height));
      }
      const [left, right] = frames;
      if (left.width !== right.width || left.height !== right.height) {
        throw new Error('Screenshot dimensions do not match');
      }
      let difference = 0;
      for (let i = 0; i < left.data.length; i += 4) {
        for (let channel = 0; channel < 3; channel++) {
          difference += Math.abs(
            left.data[i + channel] - right.data[i + channel]
          );
        }
      }
      return difference / ((left.data.length / 4) * 3);
    },
    [first.toString('base64'), second.toString('base64')]
  );
}
