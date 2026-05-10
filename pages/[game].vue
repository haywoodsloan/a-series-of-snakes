<template>
  <div class="game-host">
    <canvas ref="canvasRef" class="game-canvas" />
    <button v-if="showRestart" class="restart" @click="restart">Restart</button>
  </div>
</template>

<script setup>
import games from '~/games/index.js';

const route = useRoute();
const canvasRef = ref(null);
const showRestart = ref(false);
let instance = null;
let GameClass = null;

function destroyGame() {
  instance?.destroy();
  instance = null;
}

function startGame() {
  const canvas = canvasRef.value;
  if (!canvas || !GameClass) return;
  showRestart.value = false;
  instance = new GameClass(canvas);
  canvas.addEventListener('gameover', onGameOver, { once: true });
  instance.start();
}

function onGameOver() {
  showRestart.value = true;
}

function restart() {
  destroyGame();
  startGame();
}

watch(
  () => route.params.game,
  async (name) => {
    destroyGame();
    GameClass = null;
    showRestart.value = false;

    const game = games.find((g) => g.name === name);
    if (!game) {
      navigateTo('/', { replace: true });
      return;
    }

    ({ default: GameClass } = await game.load());
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

  display: flex;
}

.game-canvas {
  flex-grow: 1;

  display: block;
  width: 100%;
  height: 100%;
}

.restart {
  position: absolute;
  left: 50%;
  top: 53%;
  transform: translate(-50%, -50%) scaleY(1.4);
  transform-origin: center;

  padding: 0.75rem 1.5rem;
  font-family: PublicPixel, monospace;
  font-size: 1.5rem;
  line-height: 1;

  color: #d4ffd4;
  background: transparent;
  border: solid 0.15rem #d4ffd4;
  border-radius: 0.25rem;
  cursor: pointer;
  text-shadow: 0 0 0.3rem currentColor;
  box-shadow: 0 0 0.6rem rgba(212, 255, 212, 0.4);
  transition:
    transform 0.15s ease-out,
    box-shadow 0.15s ease-out,
    text-shadow 0.15s ease-out;

  &:hover,
  &:focus-visible {
    outline: none;
    transform: translate(-50%, -50%) scaleY(1.4) scale(1.1);
    text-shadow: 0 0 0.5rem currentColor;
    box-shadow: 0 0 1rem rgba(212, 255, 212, 0.6);
  }
}
</style>
