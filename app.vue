<template>
  <div class="crt">
    <NuxtRouteAnnouncer />
    <div class="main">
      <div class="header">
        <h1 class="title">A Series of Snakes</h1>
        <NuxtLink v-if="showBack" to="/" class="back" aria-label="Back" draggable="false">
          <span class="chevron" aria-hidden="true">&lt;</span> BACK
        </NuxtLink>
      </div>
      <NuxtPage />
    </div>
  </div>
</template>

<script setup>
const route = useRoute();
const showBack = computed(() => route.path !== '/');
</script>

<style lang="scss">
html,
body {
  margin: 0;
  padding: 0;

  min-width: 1300px;
  min-height: 800px;

  background-color: black;
}

html {
  // Let the page scroll when the viewport is smaller than the minimum
  // playable area on either axis, instead of clipping the game.
  overflow: auto;
}

body {
  // Body fills at least the viewport so the CRT can size to 100% without
  // collapsing, but is free to grow past it on either axis.
  min-height: 100vh;
  min-width: 100vw;

  // SHOUTING MODE: every glyph in the app rendered in PublicPixel reads
  // better in caps, so just uppercase everything globally.
  text-transform: uppercase;
}

@font-face {
  font-family: 'PublicPixel';
  src: url('~/assets/fonts/PublicPixel.ttf') format('truetype');
  // Avoid invisible-text flash on slow networks; show fallback then swap in.
  font-display: swap;
}

// Interactive controls shouldn't be draggable or text-selectable -- dragging
// an anchor in particular kicks off a browser drag-and-drop with a ghost
// image, which is never what we want for in-app navigation.
a,
button {
  -webkit-user-drag: none;
  user-select: none;
}
</style>

<style lang="scss" scoped>
@import url('~/assets/css/crt.scss');

.crt {
  height: 100vh;
  min-width: 1300px;
  min-height: 800px;
  background:
    url('/image/noise.png'),
    radial-gradient(
      ellipse at center,
      rgba(20, 65, 38, 1) 0%,
      rgba(12, 45, 25, 1) 55%,
      rgba(4, 18, 10, 1) 100%
    );
}

.main {
  height: 100%;
  overflow: hidden;

  display: flex;
  flex-direction: column;

  .header {
    flex: 0 0 auto;

    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-right: 1rem;
    margin-bottom: 1.5rem;
  }
}

.title {
  font-family: PublicPixel;
  font-size: 3.5rem;

  color: #d4ffd4;
  text-shadow: 0 0 0.3rem currentColor;

  margin: 0;
  padding: 1rem;
}

.back {
  font-family: PublicPixel, monospace;
  font-size: 1.75rem;
  line-height: 1;

  color: #d4ffd4;
  text-decoration: none;
  text-shadow: 0 0 0.3rem currentColor;

  transform: scaleY(1.4);
  transform-origin: center;
  transition:
    transform 0.15s ease-out,
    text-shadow 0.15s ease-out;

  .chevron {
    // PublicPixel renders `<` low relative to caps; nudge it up so it lines
    // up with the "Back" text.
    display: inline-block;
    vertical-align: top;
    transform: translateY(-0.12em);
  }

  &:hover,
  &:focus-visible {
    outline: none;
    transform: scaleY(1.4) scale(1.15);
    text-shadow: 0 0 0.5rem currentColor;
  }
}
</style>
