/**
 * Shared color palette for the game canvas and the surrounding chrome.
 * Keep all theme colors here so the look stays consistent across games
 * and tweaks happen in one place. Vue/SCSS files pull these into styles
 * via `v-bind(NAME)`; only static assets (e.g. shadow rgba accents in
 * `assets/css/crt.scss`) still hardcode hex values, and those don't need
 * to follow palette changes.
 */

// Primary foreground: snake bodies, border, score chrome text.
export const FG = '#d4ffd4';

// Opaque playfield fill, drawn inside the border.
export const PLAYFIELD_BG = '#050505';

// Default food pellet color.
export const FOOD = '#ff6b6b';

// Score readout (top-left "SCORE").
export const SCORE = '#ffd86b';

// High-score readout (top-right "HI") and scoreboard accent.
export const HIGH = '#ff9e6b';

// Secondary snake tint, used when a game has more than one snake so the
// two read as visually distinct on the playfield.
export const SNAKE_ALT = '#6bd4ff';

// Wall/spike obstacle color. Light grey so spikes read as inert hazards
// rather than another snake.
export const WALL = '#bfbfbf';
