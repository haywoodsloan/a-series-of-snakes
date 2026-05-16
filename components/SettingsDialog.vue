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
      <div
        ref="panelRef"
        class="settings-panel"
        tabindex="-1"
        @keydown="onPanelKeydown"
      >
        <div id="settings-title" class="settings-title">
          <span class="asterisk" aria-hidden="true">*</span>
          SETTINGS
          <span class="asterisk" aria-hidden="true">*</span>
        </div>

        <div class="settings-rows">
          <div class="settings-row">
            <span class="settings-label">BASE SPEED</span>
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
              <span class="value">{{ settings.baseSpeed }}<span class="unit-suffix">X</span></span>
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
            <span class="settings-label">GRID SIZE</span>
            <div class="settings-control">
              <button
                type="button"
                class="step"
                aria-label="Decrease grid size"
                :disabled="gridSizeIndex === 0"
                @click="stepGridSize(-1)"
              >
                &lt;
              </button>
              <span class="value">{{ settings.gridSize }}<span class="unit-x">X</span>{{ settings.gridSize }}</span>
              <button
                type="button"
                class="step"
                aria-label="Increase grid size"
                :disabled="gridSizeIndex === GRID_SIZE_OPTIONS.length - 1"
                @click="stepGridSize(1)"
              >
                &gt;
              </button>
            </div>
          </div>

          <div class="settings-row">
            <span class="settings-label">GRID LINES</span>
            <div class="settings-control">
              <span class="step step-placeholder" aria-hidden="true"></span>
              <button
                type="button"
                class="toggle"
                :aria-pressed="settings.gridLines"
                @click="settings.gridLines = !settings.gridLines"
              >
                {{ settings.gridLines ? 'SHOWN' : 'HIDDEN' }}
              </button>
              <span class="step step-placeholder" aria-hidden="true"></span>
            </div>
          </div>
        </div>

        <button type="button" class="settings-close" @click="close">
          <span class="chevron" aria-hidden="true">&lt;</span> BACK
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { FG } from '~/utils/colors.js';
import {
  GRID_SIZE_OPTIONS,
  SPEED_OPTIONS,
  settings,
} from '~/utils/settings.js';

const props = defineProps({
  open: { type: Boolean, default: false },
});
const emit = defineEmits(['close']);

const panelRef = ref(null);
// Element to restore focus to when the dialog closes -- captured at open.
let previouslyFocused = null;

function getFocusable() {
  const panel = panelRef.value;
  if (!panel) return [];
  const nodes = panel.querySelectorAll(
    'button, [tabindex]:not([tabindex="-1"])'
  );
  return Array.from(nodes).filter(
    (el) => !el.disabled && el.offsetParent !== null
  );
}

function onPanelKeydown(event) {
  if (event.key !== 'Tab') return;
  const focusables = getFocusable();
  if (focusables.length === 0) {
    event.preventDefault();
    panelRef.value?.focus();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (event.shiftKey) {
    if (active === first || active === panelRef.value) {
      event.preventDefault();
      last.focus();
    }
  } else if (active === last) {
    event.preventDefault();
    first.focus();
  }
}

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

// Grid size uses the same stepper pattern as speed; index into
// GRID_SIZE_OPTIONS is the source of truth. Changes take effect when
// the next game is constructed (the engine reads `settings.gridSize`
// at construction time).
const gridSizeIndex = computed(() =>
  Math.max(0, GRID_SIZE_OPTIONS.indexOf(settings.gridSize))
);

function stepGridSize(delta) {
  const next = Math.min(
    GRID_SIZE_OPTIONS.length - 1,
    Math.max(0, gridSizeIndex.value + delta)
  );
  settings.gridSize = GRID_SIZE_OPTIONS[next];
}

function close() {
  emit('close');
}

// Move focus into the panel when it opens so Esc-to-close works without
// the user having to click first. Also save/restore the previously-focused
// element so closing the dialog returns focus to its trigger.
watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      previouslyFocused =
        typeof document !== 'undefined' ? document.activeElement : null;
      await nextTick();
      panelRef.value?.focus();
    } else if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus();
      previouslyFocused = null;
    }
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
  // Layout magic number extracted as a variable so future tweaks are
  // a one-place edit. Sized to fit the widest value (`100X100` = 7ch),
  // with a touch of slack so the value never feels cramped against the
  // stepper arrows.
  --settings-value-width: 8ch;

  // Size to content so the right edge sits flush against the widest
  // row's `>` stepper; the symmetric horizontal padding then gives
  // equal empty space on either side of the content.
  width: max-content;
  padding: 2rem 3.5rem;

  background: rgba(4, 18, 10, 0.92);
  border: 0.25rem solid v-bind(FG);
  box-shadow:
    0 0 0.75rem v-bind(FG),
    inset 0 0 0.5rem rgba(212, 255, 212, 0.15);

  color: v-bind(FG);
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

.settings-rows {
  // Two-column grid so every row's label column and control column line
  // up with each other, regardless of intrinsic content widths. Rows
  // use `display: contents` so their label/control children participate
  // directly in this grid.
  display: grid;
  grid-template-columns: auto auto;
  column-gap: 4rem;
  row-gap: 1.5rem;
}

.settings-row {
  display: contents;
}

.settings-label {
  font-size: 1.25rem;
  line-height: 1;
  align-self: center;
  transform: scaleY(1.4);
  transform-origin: center left;
}

.settings-control {
  // Three-column grid so the `<` arrow, value, and `>` arrow line up
  // across every row -- including the toggle row, which uses invisible
  // `.step-placeholder` spans in the arrow slots.
  display: grid;
  grid-template-columns: auto var(--settings-value-width) auto;
  align-items: center;
  column-gap: 0.5rem;
  font-size: 1.25rem;
  line-height: 1;

  .value {
    text-align: center;
    transform: scaleY(1.4);
    // The value is non-interactive read-only text between two buttons;
    // clicking-and-dragging to select it is never useful and just leaves
    // a stray highlight when users miss the stepper buttons.
    user-select: none;
    -webkit-user-select: none;
  }

  .unit-x {
    // PublicPixel's `x` glyph is as tall as the digits; shrink it so the
    // separator reads as a divider instead of competing with the numbers.
    font-size: 0.65em;
    margin: 0 0.5em;
    vertical-align: 0.15em;
  }

  .unit-suffix {
    // Tighter-than-a-space gap between the number and its unit `X`,
    // while keeping the `X` at full size.
    margin-left: 0.25em;
  }
}

// Shared button look: transparent, FG text, hover glow. Used for the
// stepper arrows, the toggle, and the close button.
%pixel-button {
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
  // Give the chevrons a layout width that reflects their rendered size:
  // PublicPixel + the hover glow extends well past the natural glyph
  // box, and `scaleY(1.4)` doesn't add to the layout box, so without
  // explicit padding the parent's `max-content` sizing leaves the
  // chevrons sitting flush against the panel border.
  min-width: 1.25rem;
  padding: 0 0.5rem;
  // PublicPixel's `<` and `>` glyphs sit a touch low relative to the
  // value text; nudge them up so they line up optically with the digits.
  transform: translateY(-0.08em) scaleY(1.4);
  transform-origin: center center;
  // Animate the scale-up on hover/focus so the chevrons grow the same
  // way the dialog's BACK button does.
  transition:
    transform 0.15s ease-out,
    text-shadow 0.15s ease-out;

  &:hover:not(:disabled),
  &:focus-visible {
    transform: translateY(-0.08em) scaleY(1.4) scale(1.25);
  }

  // The leading `<` button is the first item in each control row and
  // the trailing `>` is the last; dropping their outer padding lets the
  // panel's own padding be the only gap between them and the panel's
  // edges.
  &:first-child {
    padding-left: 0;
  }

  &:last-child {
    padding-right: 0;
  }
}

.toggle {
  @extend %pixel-button;
  min-width: 7ch;
  text-align: center;
  transform: scaleY(1.4);
}

// Invisible same-width-as-`.step` slots that flank the toggle button so
// it occupies the same horizontal position as the value text in the
// stepper rows -- aligning "HIDDEN" / "SHOWN" with "1 X" / "30X30".
.step-placeholder {
  visibility: hidden;
  pointer-events: none;
}

.settings-close {
  // Visually identical to the header `.back` link so the dialog's exit
  // reads as the same navigation gesture: same chevron nudge, same
  // hover-scale glow. Sized a touch smaller than the header link so it
  // reads as a secondary action inside the panel.
  font-size: 1.5rem;
  line-height: 1;
  color: v-bind(FG);
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  text-shadow: 0 0 0.3rem currentColor;

  align-self: center;
  margin-top: 0.5rem;
  transform: scaleY(1.4);
  transform-origin: center;
  transition:
    transform 0.15s ease-out,
    text-shadow 0.15s ease-out;

  .chevron {
    // PublicPixel renders `<` low relative to caps; nudge it up so it
    // lines up with the "BACK" text (same trick as the header link).
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
