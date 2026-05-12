/**
 * Shared color palette for the game canvas. Keep all in-game colors here so
 * the look stays consistent across games and tweaks happen in one place.
 *
 * NOTE: The Vue/SCSS styles in `app.vue` and `pages/*.vue` duplicate a few
 * of these values (notably `FG`, `SCORE`, and `HIGH`) for chrome that lives
 * outside the canvas. SCSS can't import from JS, so those literals are kept
 * in sync by hand -- if you change a value here, grep the .vue/.scss files
 * for the old hex and update them too.
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
