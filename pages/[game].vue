<template>
  <div class="game-host">
    <canvas ref="canvasRef" class="game-canvas" />
    <div v-if="showOverlay" class="overlay">
      <div class="game-over" aria-label="Game over">GAME OVER</div>
      <form v-if="needsName" class="name-entry" @submit.prevent="submitName">
        <label class="prompt">{{
          isTopScore ? 'New high score! Enter initials' : 'Enter initials'
        }}</label>
        <div class="initials-wrap">
          <input
            ref="nameInput"
            v-model="initials"
            class="initials"
            maxlength="3"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            inputmode="text"
            aria-label="Initials"
            @input="onInitialsInput"
          />
          <div class="initials-ghost" aria-hidden="true">
            <span :class="{ pending: initials.length === 0 }"
              ><i>{{ initials[0] || '_' }}</i></span
            >
            <span :class="{ pending: initials.length === 1 }"
              ><i>{{ initials[1] || '_' }}</i></span
            >
            <span :class="{ pending: initials.length === 2 }"
              ><i>{{ initials[2] || '_' }}</i></span
            >
          </div>
        </div>
        <button
          type="submit"
          class="overlay-btn"
          :disabled="initials.length < 3"
        >
          ENTER
        </button>
      </form>
      <div v-else class="end-screen">
        <button ref="restartBtn" class="overlay-btn restart" @click="restart">
          PLAY AGAIN
        </button>
        <ol
          v-if="highScores.length"
          class="scoreboard"
          aria-label="High scores"
        >
          <li class="scoreboard-header">
            <span class="rank">RANK</span>
            <span class="name">NAME</span>
            <span class="score">SCORE</span>
          </li>
          <li
            v-for="(entry, idx) in highScores"
            :key="idx"
            class="scoreboard-row"
            :class="{ current: idx === currentIndex }"
          >
            <span class="rank">{{ String(idx + 1).padStart(2, '0') }}</span>
            <span class="name">{{ entry.name }}</span>
            <span class="score">{{ entry.score }}</span>
          </li>
        </ol>
      </div>
    </div>
  </div>
</template>

<script setup>
import games from '~/games/index.js';
import { FG, HIGH, SCORE } from '~/utils/colors.js';
import { loadScores, sanitizeInitials } from '~/utils/highscores.js';

// Build the lookup once at module init -- avoids an O(n) scan per route
// change. `games` is a static module-level array, so the map is stable.
const gamesByName = new Map(games.map((g) => [g.name, g]));

const route = useRoute();
const canvasRef = ref(null);
const nameInput = ref(null);
const restartBtn = ref(null);

// Per-game tab title: "A Series of Snakes | <Game>" (capitalized game name).
useHead({
  title: () => {
    const name = String(route.params.game ?? '');
    if (!name) return 'A Series of Snakes';
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    return `A Series of Snakes | ${label}`;
  },
});
const showOverlay = ref(false);
const needsName = ref(false);
const isTopScore = ref(false);
const initials = ref('');
const highScores = ref([]);
// Index of the entry the player just submitted, so it can be highlighted
// on the scoreboard. -1 when there's nothing to highlight.
const currentIndex = ref(-1);
let instance = null;
let GameClass = null;
let currentName = null;
let lastScore = 0;

function destroyGame() {
  instance?.destroy();
  instance = null;
}

function startGame() {
  const canvas = canvasRef.value;
  if (!canvas || !GameClass) return;
  showOverlay.value = false;
  needsName.value = false;
  isTopScore.value = false;
  initials.value = '';
  highScores.value = [];
  currentIndex.value = -1;
  lastScore = 0;
  instance = new GameClass(canvas);
  canvas.addEventListener('gameover', onGameOver, { once: true });
  instance.start();
}

function onGameOver(event) {
  showOverlay.value = true;
  lastScore = event.detail?.score ?? 0;
  // Always prompt for initials when the player actually scored, even if
  // the run won't land in the top 10; saveScore filters non-qualifying
  // entries out automatically. The label is louder when the score is the
  // new #1.
  needsName.value = lastScore > 0;
  isTopScore.value = lastScore > 0 && lastScore > (instance?.highScore ?? 0);
  if (needsName.value) {
    nextTick(() => nameInput.value?.focus());
  } else {
    // No entry needed; just show the existing table.
    highScores.value = loadScores(event.detail?.gameKey ?? currentName);
    currentIndex.value = -1;
  }
}

function onInitialsInput(event) {
  // Strip to uppercase A-Z, max 3 chars, with no padding -- shared with
  // the persistence layer so the on-screen form and the saved name stay
  // identically constrained.
  const cleaned = sanitizeInitials(event.target.value);
  initials.value = cleaned;
  event.target.value = cleaned;
}

function submitName() {
  if (initials.value.length < 3 || !instance) return;
  const list = instance.submitHighScore(initials.value);
  highScores.value = list;
  // Find the player's entry. On a tie with one or more existing scores
  // the new entry is sorted to the bottom of the tie group (stable sort
  // preserves insertion order, and the new entry was just pushed), so
  // `findLastIndex` picks the player's row rather than an older identical
  // one.
  currentIndex.value = list.findLastIndex(
    (e) => e.name.startsWith(initials.value) && e.score === lastScore
  );
  needsName.value = false;
  // Hand focus to the Play Again button so Enter/Space immediately
  // restarts the run without an extra click.
  nextTick(() => restartBtn.value?.focus());
}

function restart() {
  destroyGame();
  startGame();
}

watch(
  () => route.params.game,
  async (name) => {
    destroyGame();
    showOverlay.value = false;

    const game = gamesByName.get(name);
    if (!game) {
      navigateTo('/', { replace: true });
      return;
    }

    // Avoid re-awaiting the dynamic import if the route resolved to the
    // same game (e.g. HMR or query-only navigation).
    if (name !== currentName || !GameClass) {
      ({ default: GameClass } = await game.load());
      currentName = name;
    }
    startGame();
  },
  { immediate: true, flush: 'post' }
);

onBeforeUnmount(destroyGame);
</script>

<style lang="scss" scoped>
.game-host {
  flex-grow: 1;
  position: relative;

  // Allow this flex item to shrink below its content's intrinsic size so
  // the canvas can get smaller when the window shrinks.
  min-width: 0;
  min-height: 0;
}

.game-canvas {
  // Take size from the host instead of contributing intrinsic size to it.
  // Without this, the canvas's width/height attributes (set by the engine
  // to match DPR-scaled pixels) act as min-content and prevent shrinking.
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}

.overlay {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2.5rem;
}

.game-over {
  font-family: PublicPixel, monospace;
  font-size: 3rem;
  line-height: 1;
  color: v-bind(FG);
  text-shadow: 0 0 0.5rem currentColor;
  letter-spacing: 0.25rem;
  white-space: nowrap;
}

.end-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2.5rem;
}

.scoreboard {
  list-style: none;
  margin: 0;
  padding: 1.25rem 2rem;

  display: grid;
  row-gap: 0.7rem;
  min-width: 32rem;

  color: v-bind(FG);
  font-family: PublicPixel, monospace;
  font-size: 1.5rem;
  line-height: 1.2;
  text-shadow: 0 0 0.3rem currentColor;

  background: rgba(0, 5, 0, 0.7);
  border: solid 0.15rem v-bind(FG);
  border-radius: 0.4rem;
  box-shadow: 0 0 0.8rem rgba(212, 255, 212, 0.35);

  li {
    display: grid;
    grid-template-columns: 5ch 1fr 9ch;
    column-gap: 2.25rem;
    align-items: center;
  }

  .scoreboard-header {
    color: v-bind(SCORE);
    padding-bottom: 1.4rem;
    position: relative;

    &::after {
      content: '..........................................';
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      overflow: hidden;
      white-space: nowrap;
      font-family: PublicPixel, monospace;
      font-size: 1.75rem;
      line-height: 1;
      letter-spacing: 0.1rem;
      color: v-bind(HIGH);
      text-shadow: 0 0 0.3rem rgba(255, 158, 107, 0.5);
      pointer-events: none;
    }

    // Override the per-cell opacity tweaks so the header reads as a
    // single solid amber row matching the in-game SCORE label.
    .rank,
    .name,
    .score {
      color: v-bind(SCORE);
      opacity: 1;
    }
  }

  .rank {
    text-align: right;
    opacity: 0.7;
  }

  .name {
    letter-spacing: 0.25rem;
  }

  .score {
    text-align: right;
    color: v-bind(SCORE);
  }

  .scoreboard-row.current {
    color: #fff;
    text-shadow:
      0 0 0.3rem v-bind(FG),
      0 0 0.6rem v-bind(FG);
    animation: row-flash 0.6s steps(1) infinite;

    .rank,
    .score {
      color: #fff;
      opacity: 1;
    }
  }
}

@keyframes row-flash {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

.name-entry {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2.25rem;

  .prompt {
    font-family: PublicPixel, monospace;
    font-size: 1.35rem;
    color: v-bind(FG);
    text-shadow: 0 0 0.3rem currentColor;
    transform: scaleY(1.4);
    transform-origin: center;
    white-space: nowrap;
  }

  // Stack a real input under a 3-slot visual readout. The input itself is
  // transparent so the slot characters underneath are what the player sees;
  // this guarantees consistent spacing and makes the "exactly 3" framing
  // visually unmistakable.
  .initials-wrap {
    position: relative;
    width: 11rem;
    height: 4rem;
  }

  .initials {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    margin: 0;
    border: none;
    outline: none;
    background: transparent;
    color: transparent;
    caret-color: transparent;
    font-family: PublicPixel, monospace;
    font-size: 2.25rem;
    letter-spacing: 1.4rem;
    text-align: center;
    text-transform: uppercase;
    z-index: 1;
  }

  .initials-ghost {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.6rem;
    pointer-events: none;

    span {
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: PublicPixel, monospace;
      font-size: 2.25rem;
      line-height: 1;

      color: v-bind(FG);
      text-shadow: 0 0 0.3rem currentColor;
      border: solid 0.2rem v-bind(FG);
      border-radius: 0.25rem;
      box-shadow:
        0 0 0.6rem rgba(212, 255, 212, 0.5),
        inset 0 0 0.5rem rgba(212, 255, 212, 0.25);

      // Blink only the glyph (the inner <i>) for the slot still waiting
      // for a character, so the box stays steady but the placeholder
      // underscore visibly pulses.
      i {
        font-style: normal;
        display: inline-block;
      }

      &.pending i {
        animation: caret-blink 0.5s steps(1) infinite;
      }
    }
  }
}

@keyframes caret-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

.overlay-btn {
  padding: 0.75rem 1.5rem;
  font-family: PublicPixel, monospace;
  font-size: 1.5rem;
  line-height: 1;

  color: v-bind(FG);
  background: transparent;
  border: solid 0.15rem v-bind(FG);
  border-radius: 0.25rem;
  cursor: pointer;
  text-shadow: 0 0 0.3rem currentColor;
  box-shadow: 0 0 0.6rem rgba(212, 255, 212, 0.4);
  transform: scaleY(1.4);
  transform-origin: center;
  transition:
    transform 0.15s ease-out,
    box-shadow 0.15s ease-out,
    text-shadow 0.15s ease-out;

  &:disabled {
    cursor: default;
    opacity: 0.4;
  }

  &:not(:disabled):hover,
  &:not(:disabled):focus-visible {
    outline: none;
    transform: scaleY(1.4) scale(1.1);
    text-shadow: 0 0 0.5rem currentColor;
    box-shadow: 0 0 1rem rgba(212, 255, 212, 0.6);
  }
}
</style>
