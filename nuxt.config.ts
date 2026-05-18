// https://nuxt.com/docs/api/configuration/nuxt-config

// Test builds opt in to sourcemaps via `NUXT_TEST=1` so Playwright
// failures and browser console errors map back to source files. The
// deploy / production build leaves the flag unset, so the public
// bundle ships without `.map` sidecars.
const isTestBuild = process.env.NUXT_TEST === '1';

export default defineNuxtConfig({
  compatibilityDate: '2026-05-10',
  devtools: { enabled: true },
  modules: ['@nuxt/fonts'],

  // GitHub Pages serves static files only; SPA mode + prerendered routes.
  ssr: false,
  app: {
    baseURL: '/a-series-of-snakes/',
    // Cache-bust hashed bundles aggressively; the HTML shell isn't cached.
    buildAssetsDir: '/_nuxt/',
    head: {
      title: 'A Series of Snakes',
      // SVG favicon (snake from the chase preview). Modern browsers will
      // prefer the SVG; the legacy .ico stays as a fallback.
      link: [
        {
          rel: 'icon',
          type: 'image/svg+xml',
          href: '/a-series-of-snakes/favicon.svg',
        },
        { rel: 'alternate icon', href: '/a-series-of-snakes/favicon.ico' },
      ],
    },
  },

  nitro: {
    preset: 'github-pages',
    // Strip dev-only metadata + minify static HTML/JSON output.
    minify: true,
    prerender: {
      // Crawl from the index to pick up <NuxtLink> targets (per-game pages).
      crawlLinks: true,
      routes: ['/'],
      failOnError: false,
    },
  },

  // Drop noisy dev features from the production bundle. Sourcemaps are
  // emitted only for test builds (opt in via `NUXT_TEST=1`).
  sourcemap: { client: isTestBuild, server: isTestBuild },
  features: { devLogs: false },
  experimental: {
    // Workaround for Nuxt 4.4.4 SPA dev regression:
    // "Vite Node IPC socket path not configured." (nuxt/nuxt#34957)
    // Remove once the fix from nuxt/nuxt#34959 ships in a patch release.
    viteEnvironmentApi: true,
    payloadExtraction: true,
  },

  vite: {
    build: {
      cssCodeSplit: true,
      // Inline only tiny assets; ship the rest as cacheable files.
      assetsInlineLimit: 4096,
    },
  },
});
