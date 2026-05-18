import { defineConfig, devices } from '@playwright/test';

// Match the CSS minimum playable area declared in app.vue
// (`min-width: 1300px; min-height: 800px`). Below this the page starts
// scrolling, which would make e2e + visual assertions flaky.
const VIEWPORT = { width: 1300, height: 800 };

// Playwright drives a real browser against the static build served by
// `serve` on port 3000. Keep this minimal so the suite stays fast
// enough to gate every push.
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 30_000,
  // Visual baselines are platform-agnostic: one PNG per assertion, shared
  // across every OS / project. The default template ("name-project-os.png")
  // would force separate Linux + Windows + macOS baselines, which we
  // don't want for a web app rendered the same everywhere.
  snapshotDir: './tests/visual/screenshots',
  snapshotPathTemplate: '{snapshotDir}/{arg}{ext}',
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      // Slightly looser pixel match so font-hinting + subpixel AA
      // differences between OSes don't false-positive on the shared
      // cross-OS baseline. Most UI is rendered in PublicPixel which is
      // pixel-aligned and stable; this slack only matters for non-pixel-
      // sized text and box-shadow halos.
      maxDiffPixelRatio: 0.02,
      threshold: 0.2,
      animations: 'disabled',
      caret: 'hide',
    },
  },
  use: {
    baseURL: 'http://127.0.0.1:3000/',
    trace: 'on-first-retry',
  },
  projects: [
    {
      // The `devices` preset bakes in a 1280x720 viewport; override
      // after the spread to match the app's CSS minimum.
      name: 'chromium',
      testDir: './tests/e2e',
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORT },
    },
    {
      name: 'firefox',
      testDir: './tests/e2e',
      use: { ...devices['Desktop Firefox'], viewport: VIEWPORT },
    },
    {
      // Visual regression runs only on chromium -- deterministic font
      // rendering across runs; cross-browser visual diffs add noise
      // without test value.
      name: 'visual',
      testDir: './tests/visual',
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORT },
    },
  ],
  webServer: {
    // Build with NUXT_APP_BASE_URL=/ so the prerendered HTML and asset
    // references resolve at the root, then serve the static output with
    // `serve` on port 3000. The deploy build still uses the real
    // `/a-series-of-snakes/` baseURL from nuxt.config.ts -- this override
    // is test-only.
    command: 'nuxt build && serve -l 3000 -n .output/public',
    env: { NUXT_APP_BASE_URL: '/', NUXT_TEST: '1' },
    url: 'http://127.0.0.1:3000/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Suppress all build / server chatter. `serve`'s per-request HTTP
    // logs (stdout) and Nuxt/Vite's plugin warnings about sourcemaps
    // (stderr) aren't actionable. A real failure surfaces as either a
    // non-zero exit or the `url` health-check timing out.
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
