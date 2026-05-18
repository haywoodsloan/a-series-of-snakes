import { fileURLToPath } from 'node:url';
import { defineVitestProject } from '@nuxt/test-utils/config';
import { defineConfig } from 'vitest/config';

// Two projects so unit tests run in a fast node/happy-dom environment
// without paying the cost of booting Nuxt, while integration tests get
// the full Nuxt runtime (auto-imports, components, modules).
export default defineConfig({
  test: {
    // V8 coverage spans both projects (unit + integration) so a single
    // `--coverage` run reports against every source path that any test
    // exercises. HTML report under `coverage/` is gitignored.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['games/**/*.js', 'utils/**/*.js', 'components/**/*.vue', 'pages/**/*.vue', 'app.vue'],
      exclude: [
        'tests/**',
        'node_modules/**',
        '.nuxt/**',
        '.output/**',
        'dist/**',
        '**/*.config.{js,ts}',
      ],
      // Coverage gate: fails the run if the overall percentages drop
      // below these floors. Numbers are set just under current measured
      // values so a regression is caught but the current suite stays
      // green. Bump up as new tests land.
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'happy-dom',
          include: ['tests/unit/**/*.test.{js,ts}'],
        },
        resolve: {
          alias: {
            '~': fileURLToPath(new URL('.', import.meta.url)),
            '@': fileURLToPath(new URL('.', import.meta.url)),
          },
        },
      },
      await defineVitestProject({
        extends: true,
        test: {
          name: 'integration',
          environment: 'nuxt',
          include: ['tests/integration/**/*.test.{js,ts}'],
        },
      }),
    ],
  },
});
