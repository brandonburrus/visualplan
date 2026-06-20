import { defineConfig } from 'vitest/config'

/**
 * One workspace config with a project per package. `pnpm test` at the root runs
 * all three. Each project sets its own root so cross-package imports
 * (`@visualplan/core`, `@visualplan/runtime`) resolve through the pnpm workspace
 * symlinks, and its own environment: node for the CLI build tests, jsdom for the
 * React component and render tests.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          root: './packages/core',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'runtime',
          root: './packages/runtime',
          environment: 'jsdom',
          include: ['tests/**/*.test.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'cli',
          root: './packages/cli',
          environment: 'jsdom',
          include: ['tests/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
})
