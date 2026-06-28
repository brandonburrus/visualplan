import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

const require = createRequire(import.meta.url)

/**
 * Locate the runtime source directory in both layouts (mirrors `findRuntimePaths` in compile.ts, but
 * the shell needs only the runtime dir, not the core entry: it has no MDX plan to compile):
 * - Published: the runtime is vendored next to dist/ (`<pkg>/runtime`, with `core/index.ts` beside it).
 * - Dev (workspace): they are sibling packages, resolved via node module resolution.
 * The presence of a sibling `core/index.ts` distinguishes the true vendored layout from the
 * monorepo's own `packages/runtime` (whose core lives at `core/src/index.ts`).
 */
function findRuntimeDir(): { runtimeDir: string; coreEntry: string } {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 6; depth++) {
    const runtimeDir = join(dir, 'runtime')
    const coreEntry = join(dir, 'core', 'index.ts')
    if (existsSync(join(runtimeDir, 'queue.html')) && existsSync(coreEntry)) {
      return { runtimeDir, coreEntry }
    }
    dir = dirname(dir)
  }
  const runtimeDir = dirname(require.resolve('@visualplan/runtime/package.json'))
  const coreDir = dirname(require.resolve('@visualplan/core/package.json'))
  return { runtimeDir, coreEntry: join(coreDir, 'src', 'index.ts') }
}

/**
 * Builds the Review Queue **shell**: the single self-contained page the daemon serves at `/`. The
 * shell renders the left sidebar of queued plans and hosts the active plan in a same-origin iframe
 * (`/plan/<id>`); each plan iframe carries its own review chrome. The shell holds the daemon's
 * `/__vp_events` SSE open, which doubles as the liveness signal (closing the tab tears the daemon
 * down).
 *
 * A Vite single-file build of the runtime `queue.html` entry, analogous to `buildHtml` in compile.ts
 * but with NO plan: there is no `virtual:plan` (the shell renders only React chrome plus the iframes),
 * so the plan-only plugins (virtual-plan, share, diff, review) are omitted. The same single-file
 * plugin, esbuild automatic JSX, and `@visualplan/core` / react alias setup keep the bundle
 * self-contained (inline JS/CSS) and `@vitejs/plugin-react`-free, per project rules. The signature is
 * the contract and must not change: a zero-arg async function returning one self-contained HTML string.
 */
export async function buildQueueShell(): Promise<string> {
  const { runtimeDir, coreEntry } = findRuntimeDir()
  const outDir = await mkdtemp(join(tmpdir(), 'visualplan-queue-'))
  try {
    await build({
      root: runtimeDir,
      configFile: false,
      logLevel: 'silent',
      resolve: {
        alias: {
          '@visualplan/core': coreEntry,
          // The shell imports no plan, but theme.ts and the components still pull react; resolve the
          // JSX runtimes from the CLI's own install so a vendored runtime with no node_modules works.
          'react/jsx-runtime': require.resolve('react/jsx-runtime'),
          'react/jsx-dev-runtime': require.resolve('react/jsx-dev-runtime'),
        },
      },
      esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
      plugins: [viteSingleFile()],
      build: {
        outDir,
        emptyOutDir: true,
        rollupOptions: { input: join(runtimeDir, 'queue.html') },
      },
    })
    // Vite emits the page under its input basename, so a `queue.html` entry yields `queue.html`
    // (not `index.html`); the single-file plugin only inlines assets, it does not rename the page.
    return await readFile(join(outDir, 'queue.html'), 'utf8')
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
}
