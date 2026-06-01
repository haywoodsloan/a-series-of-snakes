// https://nuxt.com/docs/api/configuration/nuxt-config

// Test builds opt in to sourcemaps via `NUXT_TEST=1` so Playwright
// failures and browser console errors map back to source files. The
// deploy / production build leaves the flag unset, so the public
// bundle ships without `.map` sidecars.
const isTestBuild = process.env.NUXT_TEST === '1';

// GitHub Pages serves the site under a project subpath, so the
// deployed build bakes `/a-series-of-snakes/` into every asset URL.
// Local `nuxt generate` + `nuxt preview` ship a root-served bundle so
// `http://localhost:3000/` actually finds its assets instead of
// 404'ing under the production subpath. `GITHUB_ACTIONS` is set
// automatically by the CI runner and never set locally, so it cleanly
// distinguishes the deploy build from any local build (note:
// NODE_ENV=production is set by Nuxt itself during `nuxt generate`,
// so it can't be used to tell the two apart).
const isCIBuild = process.env.GITHUB_ACTIONS === 'true';
const baseURL = isCIBuild ? '/a-series-of-snakes' : '';

export default defineNuxtConfig({
  compatibilityDate: '2026-05-10',
  devtools: { enabled: true },
  modules: ['@nuxt/fonts'],

  // GitHub Pages serves static files only; SPA mode + prerendered routes.
  ssr: false,
  app: {
    baseURL: baseURL + '/',
    // Cache-bust hashed bundles aggressively; the HTML shell isn't cached.
    buildAssetsDir: '/_nuxt/',
    head: {
      title: 'A Series of Snakes',
      // SVG favicon (snake from the chase preview). Modern browsers
      // prefer the SVG; the legacy .ico stays as a fallback. Both
      // hrefs respect the active baseURL so the local preview build
      // doesn't 404 looking for them under the production subpath.
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: `${baseURL}/favicon.svg` },
        { rel: 'alternate icon', href: `${baseURL}/favicon.ico` },
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
    payloadExtraction: true,
  },

  vite: {
    build: {
      cssCodeSplit: true,
      // Inline only tiny assets; ship the rest as cacheable files.
      assetsInlineLimit: 4096,
    },
    // Pre-bundle Vue DevTools deps so dev startup doesn't trigger a
    // mid-session reload when they're discovered on first navigation.
    optimizeDeps: {
      include: ['@vue/devtools-core', '@vue/devtools-kit'],
    },
  },
});
