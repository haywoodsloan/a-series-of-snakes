<template>
  <div class="selector">
    <table class="grid">
      <tbody>
        <tr v-for="(row, rowIndex) in pageRows" :key="rowIndex">
          <td v-for="(cell, colIndex) in row" :key="colIndex">
            <button
              v-if="cell"
              class="preview"
              :style="snowStyle()"
              :aria-label="cell.name"
              @click="emit('select', cell)"
            >
              <span
                v-if="cell.preview"
                class="preview-image"
                v-html="cell.preview"
              ></span>
              <span class="label">{{ cell.name }}</span>
            </button>
            <span
              v-else
              class="preview"
              :style="snowStyle()"
              aria-hidden="true"
            ></span>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="controls">
      <button
        class="prev"
        aria-label="Previous"
        :disabled="page === 0"
        v-html="chevronLeft"
        @click="page--"
      ></button>
      <button
        class="next"
        aria-label="Next"
        :disabled="page >= pageCount - 1"
        v-html="chevronRight"
        @click="page++"
      ></button>
    </div>
  </div>
</template>

<script setup>
import chevronLeft from '~/assets/svg/chevron-left.svg?raw';
import chevronRight from '~/assets/svg/chevron-right.svg?raw';
import games from './games/index.js';

const ROWS = 4;
const COLS = 5;
const PAGE_SIZE = ROWS * COLS;

const emit = defineEmits(['select']);

const page = ref(0);
const pageCount = computed(() => Math.max(1, Math.ceil(games.length / PAGE_SIZE)));

const pageRows = computed(() => {
  const start = page.value * PAGE_SIZE;
  const slice = games.slice(start, start + PAGE_SIZE);
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      row.push(slice[r * COLS + c] ?? null);
    }
    rows.push(row);
  }
  return rows;
});

function snowStyle() {
  // Randomize delay, duration, and direction so each preview's static is
  // visually independent of its neighbors.
  const delay = -(Math.random() * 5).toFixed(2);
  const duration = (0.9 + Math.random() * 0.5).toFixed(2);
  const direction = Math.random() < 0.5 ? 'normal' : 'reverse';
  return {
    animationDelay: `${delay}s`,
    animationDuration: `${duration}s`,
    animationDirection: direction,
  };
}
</script>

<style lang="scss" scoped>
.selector {
  display: flex;
  overflow: hidden;
  
  flex-direction: column;
  justify-content: center;

  width: 70%;
  margin: 0 auto;
}

.grid {
  margin: 2rem 0;
  border-collapse: separate;
  border-spacing: 1vw;

  td {
    text-align: center;
    vertical-align: middle;
  }
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
    font-size: 1.5rem;
    line-height: 1;

    background: transparent;
    color: #d4ffd4;
    border: none;
    outline: none;
    cursor: pointer;

    &:focus-visible {
      outline: none;
    }

    &:disabled {
      cursor: default;
      opacity: 0.25;
    }

    &:not(:disabled):hover :deep(svg),
    &:not(:disabled):focus-visible :deep(svg) {
      transform: scale(1.15);
      filter: drop-shadow(0 0 0.5rem currentColor);
    }
  }

  :deep(svg) {
    width: 2.5em;
    height: 2.5em;
    filter: drop-shadow(0 0 0.3rem currentColor);
    transition:
      transform 0.15s ease-out,
      filter 0.15s ease-out;
  }
}

@keyframes snow {
  0%   { background-position:   17px   83px,  -91px   42px,   54px -127px; }
  10%  { background-position: -134px   29px,   62px -108px,  -19px   77px; }
  20%  { background-position:   88px -156px, -147px    8px,  113px   34px; }
  30%  { background-position:  -52px  121px,   39px  167px,  -86px -141px; }
  40%  { background-position:  173px   -7px, -118px  -94px,   27px   62px; }
  50%  { background-position:  -98px  -64px,  142px   55px, -161px   18px; }
  60%  { background-position:   46px  138px,   -3px -129px,   91px  -48px; }
  70%  { background-position: -157px  -41px,  108px   76px, -132px  152px; }
  80%  { background-position:   71px   97px, -176px  -23px,    8px  -89px; }
  90%  { background-position: -119px -113px,   24px  131px,  149px   41px; }
  100% { background-position:   62px   38px,  -84px  -71px,  -47px  104px; }
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
  animation: snow 1.1s steps(11) infinite;

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
      rgba(0, 0, 0, 0.35) 0,
      rgba(0, 0, 0, 0.35) 1px,
      transparent 1px,
      transparent 3px
    );
    mix-blend-mode: multiply;
    opacity: 0.6;
  }

  &:hover {
    border-color: #d4ffd4;
    box-shadow: 0 0 1.2rem rgba(212, 255, 212, 0.35);
  }

  .label {
    position: absolute;
    inset: auto 0 8%;
    z-index: 1;

    font-size: 1.4rem;
    text-align: center;
    color: #d4ffd4;
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

.preview-image {
  position: absolute;
  inset: 15% 10% 25%;
  z-index: 1;

  display: block;
  pointer-events: none;
  filter: drop-shadow(0 0 0.5rem rgba(212, 255, 212, 0.6));

  :deep(svg) {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

.preview.placeholder {
  display: block;
  cursor: default;
}
</style>
