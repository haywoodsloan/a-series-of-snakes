# A Series of Snakes

Eight variants of snake, implemented as a static Nuxt site. Gameplay
is rendered to a `<canvas>` and the UI is styled to resemble a CRT.

Deployed at: https://haywoodsloan.github.io/a-series-of-snakes/

## Game variants

| Mode       | Description                                                                      |
| ---------- | -------------------------------------------------------------------------------- |
| `classic`  | One snake and one pellet on a wrapping grid.                                     |
| `chase`    | The pellet moves away from the snake's head on its own timer.                    |
| `tunnels`  | Limited-use ability to pass through the snake's own body.                        |
| `spikes`   | Wall obstacles are placed around the board. Contact ends the run.                |
| `endless`  | No food. The snake grows every tick. Score is the length reached.                |
| `mirror`   | Two snakes move in mirrored directions across the center line from one input.    |
| `duo`      | Two snakes share the board. WASD drives one, arrows drive the other.             |
| `inverted` | Every direction input is reversed before being applied.                          |

A separate top-10 leaderboard is stored in `localStorage` for each
`(game, gridSize, baseSpeed)` combination.

## Setup

Requires Node 24+ and npm. Docker is required only to run the visual
regression suite locally.

```bash
npm install
npm run dev          # http://localhost:3000
```

Static build (the artifact published to Pages):

```bash
npm run generate     # -> .output/public/
npm run preview
```

## Scripts

| Script                       | What it does                                                            |
| ---------------------------- | ----------------------------------------------------------------------- |
| `npm run dev`                | Nuxt dev server with HMR.                                               |
| `npm run generate`           | Static prerender into `.output/public/`.                                |
| `npm run preview`            | Serve the generated bundle.                                             |
| `npm run lint`               | ESLint over the whole repo.                                             |
| `npm run format`             | Prettier write.                                                         |
| `npm test`                   | Coverage + e2e + visual. Full pre-push gate.                            |
| `npm run test:unit`          | Vitest unit project (happy-dom).                                        |
| `npm run test:integration`   | Vitest integration project (full Nuxt runtime).                         |
| `npm run test:coverage`      | Both Vitest projects with the coverage threshold gate.                  |
| `npm run test:e2e`           | Playwright e2e against Chromium and Firefox.                            |
| `npm run test:visual`        | Visual suite, in the pinned Playwright Docker image.                    |
| `npm run test:visual:update` | Re-capture visual baselines (same image).                               |
| `npm run test:visual:ci`     | Visual suite without Docker. Used by CI, which already runs on Linux.   |

## Layout

```
app/                           Nuxt v4 srcDir (application code)
  app.vue                      CRT shell, header, settings button
  pages/
    index.vue                  Game picker
    [game].vue                 Canvas + HUD + scoreboard
  components/
    SettingsDialog.vue         Speed, grid size, grid lines toggle
  games/
    engine.js                  Fixed-step engine, rendering, collisions
    index.js                   Variant registry
    classic.js, chase.js, ...  One file per variant; each extends Engine
  utils/
    colors.js                  Shared palette (canvas + CSS)
    highscores.js              localStorage leaderboards
    settings.js                Reactive settings, also localStorage
  assets/
    css/crt.scss               Scanlines, hsync jitter, snow, glow
    image/                     Build-processed images (e.g. CRT noise tile)
    svg/                       Preview tiles for the picker
public/                        Static assets served at the site root
tests/
  unit/                        happy-dom Vitest
  integration/                 Nuxt-runtime Vitest
  e2e/                         Playwright user flows
  visual/                      Playwright pixel-diff + baselines
  helpers/                     Shared test plumbing
  visual-docker.js             Wrapper that runs the visual suite in the pinned image
```

## Architecture

`games/engine.js` owns the canvas and runs a fixed-timestep loop with
a dirty-flag renderer. Each variant is a subclass of `Engine` that
typically overrides `update`, and may also override `onEat`,
`onCollision`, or `render`. The base class handles the speed ramp,
food spawning, wraparound movement, and wall obstacles.

`games/index.js` is the registry consumed by the router. Adding a new
variant requires:

1. A new `games/<name>.js` extending `Engine`.
2. A preview tile at `assets/svg/<name>.svg`.
3. An entry of the form `{ name, load: () => import('./<name>.js'), preview }`
   appended to the array.

The `/[game]` route and the picker pick up the new entry automatically.

`utils/settings.js` exposes a `reactive` object mirrored to
`localStorage`. Values are validated against `SPEED_OPTIONS` and
`GRID_SIZE_OPTIONS` on load so invalid storage cannot poison the
runtime. Live games subscribe via `onSettingsChange` to apply
speed/grid changes without a reload.

`utils/highscores.js` stores the top 10 entries per
`<game>-g<gridSize>-s<speed>` bucket. Names are limited to 3
characters. Storage failures (private mode, SSR prerender) are silent
no-ops.

## Testing

Vitest is configured with two projects: unit (happy-dom) and
integration (full Nuxt runtime). Coverage thresholds are configured in
[vitest.config.ts](vitest.config.ts) at 80/70/80/80
(statements/branches/functions/lines); the run fails if any value
drops below its threshold.

The visual suite performs pixel-diff comparisons. Font hinting and
antialiasing differ across operating systems, so screenshots captured
on a contributor machine will not match screenshots captured in CI.
To keep baselines stable:

- Baselines are stored per browser engine under
  [tests/visual/screenshots](tests/visual/screenshots).
- `npm run test:visual` invokes
  [tests/visual-docker.js](tests/visual-docker.js), which runs the
  suite inside `mcr.microsoft.com/playwright:v<version>-noble`. The
  image tag is read from `package.json` so it matches the installed
  `@playwright/test`. An anonymous volume is mounted at
  `/work/node_modules` so the container's `npm ci` does not overwrite
  the host's native modules (for example, `sass-embedded`).
- CI runs on the same Ubuntu base as the image, so the workflow calls
  `npm run test:visual:ci` directly and skips the Docker wrapper.

To accept an intentional visual change, run
`npm run test:visual:update` and commit the updated PNGs.

## CI / deployment

Two workflows under [.github/workflows](.github/workflows):

- [test.yml](.github/workflows/test.yml) runs on every push to `main`.
  It runs lint, then coverage-gated Vitest, then the Playwright e2e
  suite against Chromium and Firefox, and finally the visual
  regression suite. Each Playwright suite writes its own blob report;
  the workflow merges them into a single HTML report and uploads it
  as a build artifact. When the suite passes, the workflow
  fast-forwards `deploy` to `main` and dispatches the deploy workflow.
- [deploy.yml](.github/workflows/deploy.yml) runs on push to `deploy`.
  It executes `npm run generate` and publishes `.output/public/` to
  GitHub Pages.

The two-branch layout (`main` for source, `deploy` for tested tip)
ensures that Pages only serves commits that have passed the full
test suite.

## Controls

Movement is bound to arrow keys and WASD. In `duo`, WASD drives the
primary snake and the arrow keys drive the alternate snake.

The settings button (bottom-left, home page only) controls base speed
and grid size, and toggles an optional grid overlay. Changes apply on
the next game start, or immediately for running games that subscribe
to settings changes.

## Accessibility and motion

The CRT effect includes flicker animations along with periodic snow
and hsync jitter. Clients that report `prefers-reduced-motion: reduce`
receive near-zero-duration variants of these animations, which also
stabilizes Playwright's element-stability checks. A skip link and a
route announcer are wired in [app.vue](app.vue).

## License

No license file is included. All rights reserved. Open an issue to
discuss reuse.
