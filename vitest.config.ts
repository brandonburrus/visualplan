import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/** The shared setup for the browser-like projects (see the file's header for why it exists). */
const jsdomSetup = fileURLToPath(new URL('./vitest.setup.ts', import.meta.url))

/**
 * One workspace config with a project per package. `pnpm test` at the root runs
 * all of them. Each project sets its own root so cross-package imports
 * (`@visualplan/core`, `@visualplan/compile`, `@visualplan/runtime`) resolve through the
 * pnpm workspace symlinks, and its own environment: node for the CLI/compile build tests,
 * jsdom for the React component and render tests.
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
          name: 'compile',
          root: './packages/compile',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'runtime',
          root: './packages/runtime',
          environment: 'jsdom',
          setupFiles: [jsdomSetup],
          include: ['tests/**/*.test.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'cli',
          root: './packages/cli',
          environment: 'jsdom',
          setupFiles: [jsdomSetup],
          include: ['tests/**/*.test.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'app',
          root: './packages/app',
          environment: 'jsdom',
          setupFiles: [jsdomSetup],
          include: ['tests/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
})
