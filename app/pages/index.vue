<template>
  <div ref="selectorRef" class="selector">
    <div ref="gridRef" class="grid">
      <template
        v-for="(cell, i) in pageCells"
        :key="cell ? cell.name : `e-${i}`"
      >
        <NuxtLink
          v-if="cell"
          class="preview"
          :to="cell.to"
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
        <span v-else class="preview empty" aria-hidden="true"></span>
      </template>
    </div>
    <div ref="controlsRef" class="controls">
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

// The grid tops out at a 4x3 page on desktop. On narrow screens it drops
// to fewer columns and the page shrinks to however many whole rows fit
// the viewport (see `measurePageSize`) so the picker never needs to
// scroll -- the prev/next controls page through the rest.
const DEFAULT_PAGE_SIZE = 12;
// Below this width the grid uses fewer columns and a measured page size;
// at or above it, the single centered page is kept. Matches the column
// breakpoints in <style>.
const MOBILE_QUERY = '(max-width: 960px)';

// Pre-compute display data once: games is a static module-level array, so
// this never needs to be recomputed -- it lives in module scope and the
// component just references it.
const displayGames = games.map((g) => ({
  ...g,
  label: g.name ? g.name.toUpperCase() : g.name,
  to: `/${g.name}`,
}));

const selectorRef = ref(null);
const gridRef = ref(null);
const controlsRef = ref(null);

const page = ref(0);
const pageSize = ref(DEFAULT_PAGE_SIZE);

const pageCount = computed(() =>
  Math.max(1, Math.ceil(displayGames.length / pageSize.value))
);

// Flat array of `pageSize` cells (nulls pad the final page) -- avoids the
// nested-array allocation that the table layout previously required on
// every page change.
const pageCells = computed(() => {
  const size = pageSize.value;
  const start = page.value * size;
  const out = new Array(size);
  for (let i = 0; i < size; i++) {
    out[i] = displayGames[start + i] ?? null;
  }
  return out;
});

/**
 * How many previews fit on one page without scrolling. Desktop keeps the
 * full 4x3 page. On narrow screens the grid is top-aligned, so the grid's
 * top and a preview's height are stable regardless of the current row
 * count -- measure them and fit as many whole rows as the viewport allows
 * below the header and above the pager.
 */
function measurePageSize() {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return DEFAULT_PAGE_SIZE;
  }
  if (!window.matchMedia(MOBILE_QUERY).matches) return DEFAULT_PAGE_SIZE;

  const grid = gridRef.value;
  const selector = selectorRef.value;
  const preview = grid?.querySelector('.preview');
  if (!grid || !selector || !preview) return DEFAULT_PAGE_SIZE;

  const gs = getComputedStyle(grid);
  const cols = gs.gridTemplateColumns.split(' ').length;
  const rowGap = parseFloat(gs.rowGap) || 0;
  const rowH = preview.getBoundingClientRect().height + rowGap;
  if (rowH <= 0) return DEFAULT_PAGE_SIZE;

  const controlsH = controlsRef.value?.getBoundingClientRect().height ?? 0;
  const below =
    (parseFloat(gs.marginBottom) || 0) +
    controlsH +
    (parseFloat(getComputedStyle(selector).paddingBottom) || 0);
  const available =
    window.innerHeight - grid.getBoundingClientRect().top - below;

  const rows = Math.max(1, Math.floor((available + rowGap) / rowH));
  return Math.min(displayGames.length, cols * rows);
}

let stopResize = null;
onMounted(() => {
  // Fit the page to the viewport now, again after layout settles and
  // fonts load (both shift the header height the fit depends on), and on
  // every resize / rotation.
  const update = () => {
    pageSize.value = measurePageSize();
  };
  update();
  nextTick(update);
  document.fonts?.ready?.then(update).catch(() => {});
  window.addEventListener('resize', update);
  stopResize = () => window.removeEventListener('resize', update);
});

onBeforeUnmount(() => stopResize?.());

// Keep the current page in range when the measured page size changes.
watch(pageSize, () => {
  const maxPage = pageCount.value - 1;
  if (page.value > maxPage) page.value = maxPage;
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

// ---------- Mobile / small-screen layout ----------
// Widen the picker toward the screen edges, drop to fewer columns so each
// preview stays tappable, and top-align the grid so a tall list scrolls
// down instead of centering and clipping its first rows off-screen.
@media (max-width: 960px) {
  .selector {
    width: 92%;
    justify-content: flex-start;
    padding: 1rem 0 2rem;
  }

  .grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 2vw;
    margin: 1.25rem 0;
  }

  .controls button {
    font-size: 2.5rem;
  }
}

@media (max-width: 600px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 3vw;
  }

  .preview .label {
    font-size: 1.15rem;
  }
}
</style>
