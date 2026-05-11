// https://nuxt.com/docs/api/configuration/nuxt-config
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
        { rel: 'icon', type: 'image/svg+xml', href: '/a-series-of-snakes/favicon.svg' },
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

  // Drop noisy dev features and source maps from the production bundle.
  sourcemap: { client: false, server: false },
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
