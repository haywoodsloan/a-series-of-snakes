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
});
