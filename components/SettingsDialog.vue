<template>
  <Transition name="settings-fade">
    <div
      v-if="open"
      class="settings-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      @click.self="close"
      @keydown.esc="close"
    >
      <div ref="panelRef" class="settings-panel" tabindex="-1">
        <div id="settings-title" class="settings-title">
          <span class="asterisk" aria-hidden="true">*</span>
          Settings
          <span class="asterisk" aria-hidden="true">*</span>
        </div>

        <div class="settings-row">
          <span class="settings-label">Base Speed</span>
          <div class="settings-control">
            <button
              type="button"
              class="step"
              aria-label="Decrease speed"
              :disabled="speedIndex === 0"
              @click="stepSpeed(-1)"
            >
              &lt;
            </button>
            <span class="value">{{ formatSpeed(settings.baseSpeed) }}</span>
            <button
              type="button"
              class="step"
              aria-label="Increase speed"
              :disabled="speedIndex === SPEED_OPTIONS.length - 1"
              @click="stepSpeed(1)"
            >
              &gt;
            </button>
          </div>
        </div>

        <div class="settings-row">
          <span class="settings-label">Grid Lines</span>
          <div class="settings-control">
            <button
              type="button"
              class="toggle"
              :aria-pressed="settings.gridLines"
              @click="settings.gridLines = !settings.gridLines"
            >
              {{ settings.gridLines ? 'Shown' : 'Hidden' }}
            </button>
          </div>
        </div>

        <button type="button" class="settings-close" @click="close">
          Close &gt;
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { FG } from '~/utils/colors.js';
import { SPEED_OPTIONS, settings } from '~/utils/settings.js';

const props = defineProps({
  open: { type: Boolean, default: false },
});
const emit = defineEmits(['close']);

const panelRef = ref(null);

// Speed is exposed as a tiny < value > stepper instead of a native <select>
// because styling a select to match the pixel theme cross-browser is a
// losing battle. Index into SPEED_OPTIONS is the source of truth.
const speedIndex = computed(() =>
  Math.max(0, SPEED_OPTIONS.indexOf(settings.baseSpeed))
);

function stepSpeed(delta) {
  const next = Math.min(
    SPEED_OPTIONS.length - 1,
    Math.max(0, speedIndex.value + delta)
  );
  settings.baseSpeed = SPEED_OPTIONS[next];
}

function formatSpeed(v) {
  // "1X", "0.25X" etc -- drop trailing zeros from non-integers but keep
  // fractional digits where they exist.
  return `${v}X`;
}

function close() {
  emit('close');
}

// Move focus into the panel when it opens so Esc-to-close works without
// the user having to click first.
watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return;
    await nextTick();
    panelRef.value?.focus();
  }
);
</script>

<style lang="scss" scoped>
.settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;

  display: flex;
  align-items: center;
  justify-content: center;

  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(2px);
}

.settings-panel {
  // Sized to comfortably fit both rows + title + close button. Width is
  // wide enough that "Base Speed" + the stepper don't crowd each other.
  min-width: 32rem;
  padding: 2rem 2.5rem;

  background: rgba(4, 18, 10, 0.92);
  border: 0.25rem solid v-bind(FG);
  box-shadow:
    0 0 0.75rem v-bind(FG),
    inset 0 0 0.5rem rgba(212, 255, 212, 0.15);

  color: v-bind(FG);
  font-family: PublicPixel, monospace;
  text-shadow: 0 0 0.3rem currentColor;

  outline: none;

  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.settings-title {
  font-size: 1.75rem;
  text-align: center;
  letter-spacing: 0.1em;
  // Slight vertical stretch matches the `.back` / `.settings` button
  // treatment so the dialog reads as part of the same UI family.
  transform: scaleY(1.4);
  transform-origin: center top;
  margin-bottom: 0.75rem;

  // PublicPixel renders `*` near the top of the cell; nudge the flanking
  // asterisks down so they sit visually centered with the caps height of
  // "SETTINGS" (same trick used on the home-page settings button).
  .asterisk {
    display: inline-block;
    vertical-align: top;
    transform: translateY(0.28em);
  }
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
}

.settings-label {
  font-size: 1.25rem;
  line-height: 1;
  transform: scaleY(1.4);
  transform-origin: center left;
}

.settings-control {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 1.25rem;
  line-height: 1;

  .value {
    min-width: 4ch;
    text-align: center;
    transform: scaleY(1.4);
  }
}

// Shared button look: transparent, FG text, hover glow. Used for the
// stepper arrows, the toggle, and the close button.
%pixel-button {
  font-family: PublicPixel, monospace;
  font-size: 1.25rem;
  line-height: 1;
  color: v-bind(FG);
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  text-shadow: 0 0 0.3rem currentColor;
  transition: text-shadow 0.15s ease-out;

  &:hover:not(:disabled),
  &:focus-visible {
    outline: none;
    text-shadow: 0 0 0.6rem currentColor;
  }

  &:disabled {
    opacity: 0.3;
    cursor: default;
  }
}

.step {
  @extend %pixel-button;
  transform: scaleY(1.4);
}

.toggle {
  @extend %pixel-button;
  min-width: 7ch;
  text-align: center;
  transform: scaleY(1.4);
}

.settings-close {
  @extend %pixel-button;
  align-self: center;
  margin-top: 0.5rem;
  transform: scaleY(1.4);

  &:hover,
  &:focus-visible {
    transform: scaleY(1.4) scale(1.1);
  }
}

.settings-fade-enter-active,
.settings-fade-leave-active {
  transition: opacity 0.15s ease-out;
  .settings-panel {
    transition: transform 0.15s ease-out;
  }
}
.settings-fade-enter-from,
.settings-fade-leave-to {
  opacity: 0;
  .settings-panel {
    transform: scale(0.96);
  }
}
</style>
