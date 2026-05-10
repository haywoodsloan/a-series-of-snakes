// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-05-10',
  devtools: { enabled: true },
  modules: ['@nuxt/fonts'],
  // GitHub Pages serves static files only; SPA mode + prerendered routes.
  ssr: false,
  app: { baseURL: '/a-series-of-snakes/' },
  nitro: {
    preset: 'github-pages',
  },
  // Workaround for Nuxt 4.4.4 SPA dev regression:
  // "Vite Node IPC socket path not configured." (nuxt/nuxt#34957)
  // Remove once the fix from nuxt/nuxt#34959 ships in a patch release.
  experimental: {
    viteEnvironmentApi: true,
  },
});
