<template>
  <div class="crt">
    <NuxtRouteAnnouncer />
    <div class="main">
      <div class="header">
        <h1 class="title">A Series of Snakes</h1>
        <NuxtLink
          v-if="showBack"
          to="/"
          class="back"
          aria-label="Back"
          draggable="false"
        >
          <span class="chevron" aria-hidden="true">&lt;</span> BACK
        </NuxtLink>
      </div>
      <NuxtPage />
    </div>
    <!-- Settings only shows on the home page. Positioned fixed in the
         bottom-left corner of the viewport so it lives outside the normal
         document flow and never disturbs the page layout. -->
    <button
      v-if="!showBack"
      class="settings"
      type="button"
      aria-label="Settings"
      @click="onSettings"
    >
      <span class="asterisk" aria-hidden="true">*</span> SETTINGS
    </button>
    <SettingsDialog :open="showSettings" @close="showSettings = false" />
  </div>
</template>

<script setup>
import { FG, FOOD, SNAKE_ALT, WALL } from '~/utils/colors.js';

const route = useRoute();
const showBack = computed(() => route.path !== '/');

// Toggles the SettingsDialog overlay. Lives at the app level so the dialog
// can float above any page without each page having to wire it in.
const showSettings = ref(false);
function onSettings() {
  showSettings.value = true;
}
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

  // PublicPixel is the app-wide default; individual elements only need to
  // declare `font-family` when they want something else (no rules in this
  // codebase currently do). `inherit` propagates this through to <button>
  // and <input>, which otherwise reset to the UA default.
  font-family: PublicPixel, monospace;

  // SHOUTING MODE: every glyph in the app rendered in PublicPixel reads
  // better in caps, so just uppercase everything globally.
  text-transform: uppercase;
}

button,
input,
select,
textarea {
  font-family: inherit;
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

svg {
  // Inline SVG previews use class names that map 1:1 to the color variables
  // in utils/colors.js. Each class sets both `fill` and `stroke`; SVG elements
  // opt into one or the other via the `fill`/`stroke` attribute (e.g. a
  // stroked line sets `fill="none"` and lets `stroke` come from the class).
  // A matching colored drop-shadow gives each element a glow in its own hue
  // (snake bodies green, food red, etc.) instead of one flat green halo.
  .fg {
    fill: v-bind(FG);
    stroke: v-bind(FG);
    filter: drop-shadow(0 0 0.2rem v-bind(FG));
  }
  .snake-alt {
    fill: v-bind(SNAKE_ALT);
    stroke: v-bind(SNAKE_ALT);
    filter: drop-shadow(0 0 0.2rem v-bind(SNAKE_ALT));
  }
  .food {
    fill: v-bind(FOOD);
    stroke: v-bind(FOOD);
    filter: drop-shadow(0 0 0.2rem v-bind(FOOD));
  }
  .wall {
    // Walls render fill-only on the canvas (no border/glow), so the
    // preview class skips stroke and drop-shadow to match.
    fill: v-bind(WALL);
  }
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
    padding-right: 2rem;
    margin-bottom: 1.5rem;
  }
}

.settings {
  // Fixed in the bottom-left corner of the viewport so the button lives
  // outside the normal document flow and never disturbs the page layout.
  // Sits above the CRT background; bump z-index when a settings panel is
  // introduced that needs to overlay it.
  position: fixed;
  bottom: 1.5rem;
  left: 1.5rem;

  // Mirrors the `.back` link's pixel-font treatment so the two navigation
  // controls read as a matched pair.
  font-size: 1.75rem;
  line-height: 1;

  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  color: v-bind(FG);
  text-shadow: 0 0 0.3rem currentColor;

  transform: scaleY(1.4);
  transform-origin: center left;
  transition:
    transform 0.15s ease-out,
    text-shadow 0.15s ease-out;

  .asterisk {
    // PublicPixel renders `*` high in the cell; nudge it down to vertically
    // center with the caps height of "SETTINGS", and pull the text in with
    // a negative right margin so the two don't read as separate tokens.
    display: inline-block;
    vertical-align: top;
    transform: translateY(0.28em);
    margin-right: -0.55em;
  }

  &:focus-visible {
    outline: none;
  }

  &:hover,
  &:focus-visible {
    transform: scaleY(1.4) scale(1.15);
    text-shadow: 0 0 0.5rem currentColor;
  }
}

.title {
  font-size: 3.5rem;

  color: v-bind(FG);
  text-shadow: 0 0 0.3rem currentColor;

  margin: 0;
  padding: 1rem 1rem 1rem 1.5rem;
}

.back {
  font-size: 1.75rem;
  line-height: 1;

  color: v-bind(FG);
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
