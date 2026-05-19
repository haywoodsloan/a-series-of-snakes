<template>
  <div class="selector">
    <div class="grid">
      <template
        v-for="(cell, i) in pageCells"
        :key="cell ? cell.name : `e-${i}`"
      >
        <NuxtLink
          v-if="cell"
          class="preview"
          :to="cell.to"
          :style="snowStyles[i]"
          :aria-label="cell.label"
          draggable="false"
        >
          <span
            v-if="cell.preview"
            class="preview-image"
            v-html="cell.preview"
          ></span>
          <span class="label">{{ cell.label }}</span>
        </NuxtLink>
        <span
          v-else
          class="preview empty"
          :style="snowStyles[i]"
          aria-hidden="true"
        >
          <span class="trace" :style="traceStyles[i]"></span>
        </span>
      </template>
    </div>
    <div class="controls">
      <button
        class="prev"
        aria-label="Previous"
        :disabled="page === 0"
        @click="page--"
      >
        &lt;
      </button>
      <button
        class="next"
        aria-label="Next"
        :disabled="page >= pageCount - 1"
        @click="page++"
      >
        &gt;
      </button>
    </div>
  </div>
</template>

<script setup>
import games from '~/games/index.js';
import { FG } from '~/utils/colors.js';

const ROWS = 3;
const COLS = 4;
const PAGE_SIZE = ROWS * COLS;

// Snow animation timing per preview cell.
const SNOW_MAX_DELAY = 5; // seconds; randomized negative offset upper bound
const SNOW_DURATION_MIN = 1.4; // seconds; floor of the per-cell duration
const SNOW_DURATION_RANGE = 0.6; // seconds; random range added to the floor
// Trace (scanline sweep) animation timing per preview cell.
const TRACE_MAX_DELAY = 8; // seconds; randomized negative offset upper bound
const TRACE_DURATION_MIN = 4; // seconds; floor of the per-cell duration
const TRACE_DURATION_RANGE = 3; // seconds; random range added to the floor

// Pre-compute display data once: games is a static module-level array, so
// this never needs to be recomputed -- it lives in module scope and the
// component just references it.
const displayGames = games.map((g) => ({
  ...g,
  label: g.name ? g.name.toUpperCase() : g.name,
  to: `/${g.name}`,
}));
const PAGE_COUNT = Math.max(1, Math.ceil(displayGames.length / PAGE_SIZE));

const page = ref(0);
const pageCount = PAGE_COUNT;

// Flat array of PAGE_SIZE cells -- avoids the nested-array allocation that
// the table layout previously required on every page change.
const pageCells = computed(() => {
  const start = page.value * PAGE_SIZE;
  const out = new Array(PAGE_SIZE);
  for (let i = 0; i < PAGE_SIZE; i++) {
    out[i] = displayGames[start + i] ?? null;
  }
  return out;
});

// Snow style randomization is purely visual flavor and stays constant for
// the page's lifetime; generated client-side only to avoid SSR hydration
// mismatches.
const snowStyles = shallowRef(new Array(PAGE_SIZE).fill(null).map(() => ({})));
const traceStyles = shallowRef(new Array(PAGE_SIZE).fill(null).map(() => ({})));
onMounted(() => {
  const styles = new Array(PAGE_SIZE);
  const traces = new Array(PAGE_SIZE);
  for (let i = 0; i < PAGE_SIZE; i++) {
    const delay = -(Math.random() * SNOW_MAX_DELAY).toFixed(2);
    const duration = (
      SNOW_DURATION_MIN +
      Math.random() * SNOW_DURATION_RANGE
    ).toFixed(2);
    const direction = Math.random() < 0.5 ? 'normal' : 'reverse';
    styles[i] = {
      animationDelay: `${delay}s`,
      animationDuration: `${duration}s`,
      animationDirection: direction,
    };
    // Independent trace timing per cell -- big random offset so traces
    // don't sweep across every preview in lockstep, and a wide duration
    // window so they appear at visibly different cadences.
    traces[i] = {
      animationDelay: `-${(Math.random() * TRACE_MAX_DELAY).toFixed(2)}s`,
      animationDuration: `${(
        TRACE_DURATION_MIN +
        Math.random() * TRACE_DURATION_RANGE
      ).toFixed(2)}s`,
    };
  }
  snowStyles.value = styles;
  traceStyles.value = traces;
});
</script>

<style lang="scss" scoped>
.selector {
  flex-grow: 1;

  display: flex;
  // Was `overflow: hidden`, but that clipped the preview buttons' hover
  // glow (box-shadow) on the right edge of the rightmost item in each
  // row. Let the glow extend past the column instead.
  overflow: visible;

  flex-direction: column;
  justify-content: center;

  width: 75%;
  margin: 0 auto;
}

.grid {
  margin: 2rem 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1vw;
}

.controls {
  display: flex;
  justify-content: center;
  gap: 2rem;

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;

    padding: 0.75rem 1.25rem;
    font-size: 3.25rem;
    line-height: 1;

    background: transparent;
    color: v-bind(FG);
    border: none;
    outline: none;
    cursor: pointer;
    text-shadow: 0 0 0.3rem currentColor;
    transform: scaleY(1.4);
    transform-origin: center;
    transition:
      transform 0.15s ease-out,
      text-shadow 0.15s ease-out;

    &:focus-visible {
      outline: none;
    }

    &:disabled {
      cursor: default;
      opacity: 0.25;
    }

    &:not(:disabled):hover,
    &:not(:disabled):focus-visible {
      transform: scaleY(1.4) scale(1.15);
      text-shadow: 0 0 0.5rem currentColor;
    }
  }
}

@keyframes snow {
  0% {
    background-position:
      17px 83px,
      -91px 42px,
      54px -127px;
  }
  10% {
    background-position:
      -134px 29px,
      62px -108px,
      -19px 77px;
  }
  20% {
    background-position:
      88px -156px,
      -147px 8px,
      113px 34px;
  }
  30% {
    background-position:
      -52px 121px,
      39px 167px,
      -86px -141px;
  }
  40% {
    background-position:
      173px -7px,
      -118px -94px,
      27px 62px;
  }
  50% {
    background-position:
      -98px -64px,
      142px 55px,
      -161px 18px;
  }
  60% {
    background-position:
      46px 138px,
      -3px -129px,
      91px -48px;
  }
  70% {
    background-position:
      -157px -41px,
      108px 76px,
      -132px 152px;
  }
  80% {
    background-position:
      71px 97px,
      -176px -23px,
      8px -89px;
  }
  90% {
    background-position:
      -119px -113px,
      24px 131px,
      149px 41px;
  }
  100% {
    background-position:
      62px 38px,
      -84px -71px,
      -47px 104px;
  }
}

.preview {
  position: relative;
  display: block;
  aspect-ratio: 16/10;
  width: 100%;
  padding: 0;

  cursor: pointer;
  overflow: hidden;
  isolation: isolate;
  text-decoration: none;
  color: inherit;

  border: solid 0.15rem #2a2a2a;
  border-radius: 12% / 18%;
  background-color: #050505;
  transition:
    border-color 0.15s ease-out,
    box-shadow 0.15s ease-out;

  // Black & white analog TV static. Three independently-seeded noise layers
  // thresholded to pure black/white via feComponentTransfer (discrete table
  // 0,1) for a clean 50/50 distribution, rendered at low resolution and
  // upscaled with `pixelated` so each "pixel" is a chunky ~15px block.
  background-image:
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='2' numOctaves='1' stitchTiles='stitch' seed='2'/><feComponentTransfer><feFuncA type='discrete' tableValues='0 0 0 1 1'/></feComponentTransfer><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"),
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='2' numOctaves='1' stitchTiles='stitch' seed='17'/><feComponentTransfer><feFuncA type='discrete' tableValues='0 0 0 1 1'/></feComponentTransfer><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"),
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='2' numOctaves='1' stitchTiles='stitch' seed='41'/><feComponentTransfer><feFuncA type='discrete' tableValues='0 0 0 1 1'/></feComponentTransfer><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  background-size: 200px 200px;
  background-repeat: repeat;
  image-rendering: pixelated;
  animation: snow 1.7s steps(11) infinite;

  // Curved CRT glass highlight + subtle vignette
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: inherit;
    background:
      radial-gradient(
        ellipse at 30% 20%,
        rgba(255, 255, 255, 0.18),
        transparent 55%
      ),
      radial-gradient(
        ellipse at center,
        transparent 55%,
        rgba(0, 0, 0, 0.7) 100%
      );
  }

  // Scanlines
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: inherit;
    background: repeating-linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.22) 0,
      rgba(0, 0, 0, 0.22) 1px,
      transparent 1px,
      transparent 3px
    );
    mix-blend-mode: multiply;
    opacity: 0.4;
  }

  &:hover {
    border-color: v-bind(FG);
    box-shadow: 0 0 1.2rem rgba(212, 255, 212, 0.35);
  }

  .label {
    position: absolute;
    inset: auto 0 8%;
    z-index: 1;

    font-size: 1.4rem;
    text-align: center;
    color: v-bind(FG);
    text-shadow:
      0 0 0.3rem rgba(0, 0, 0, 0.9),
      0 0 0.6rem rgba(0, 0, 0, 0.7);
    pointer-events: none;
  }
}

.preview:has(.preview-image) {
  // Suppress the snow background when a preview image is present.
  background-image: none;
  animation: none;
}

// Slow bright scanline that travels up the empty (snow-filled) previews,
// reinforcing the "live tuner" feel. Sits above the scanline lattice but
// below the vignette/highlight on the glass.
@keyframes trace {
  0% {
    top: 100%;
    opacity: 0;
  }
  15% {
    opacity: 1;
  }
  85% {
    opacity: 1;
  }
  100% {
    top: -14%;
    opacity: 0;
  }
}

.preview .trace {
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  z-index: 1;
  height: 14%;
  pointer-events: none;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    rgba(212, 255, 212, 0.03) 35%,
    rgba(212, 255, 212, 0.14) 50%,
    rgba(212, 255, 212, 0.03) 65%,
    transparent 100%
  );
  mix-blend-mode: screen;
  animation: trace 8s linear infinite;
  will-change: top, opacity;
}

.preview-image {
  position: absolute;
  inset: 10%;
  z-index: 1;

  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;

  :deep(svg) {
    max-width: 100%;
    max-height: 100%;
  }
}
</style>
