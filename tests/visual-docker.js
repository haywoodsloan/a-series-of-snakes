// Run the Playwright visual suite inside the official Playwright Docker
// image. GPU, font installation, and OS-level text rasterizer all
// affect pixel output -- pinning every run to the same image keeps
// baselines stable across contributors and matches CI exactly.
//
// Usage:
//   node tests/visual-docker.js                  # assert against baselines
//   node tests/visual-docker.js --update-snapshots

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Pin the image tag to the @playwright/test version in package.json so
// the runner that captures baselines matches the runner that asserts
// them.
const { devDependencies } = JSON.parse(
  readFileSync(resolve(repoRoot, 'package.json'), 'utf8'),
);
const version = devDependencies['@playwright/test'].replace(/^\D*/, '');
const image = `mcr.microsoft.com/playwright:v${version}-noble`;

const playwrightArgs = [
  'npx playwright test',
  '--project=visual-chromium',
  '--project=visual-firefox',
  ...process.argv.slice(2),
].join(' ');

const { status } = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--ipc=host', // recommended for Chromium in containers
    '-v', `${repoRoot}:/work`,
    // Mask the host's node_modules with an anonymous volume so the
    // container's `npm ci` installs Linux binaries inside the volume
    // instead of clobbering the host install (which breaks native
    // modules like sass-embedded on Windows/macOS after a run).
    '-v', '/work/node_modules',
    '-w', '/work',
    image,
    'sh', '-c', `npm ci && ${playwrightArgs}`,
  ],
  { stdio: 'inherit' },
);

process.exit(status ?? 1);
