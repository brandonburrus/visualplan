import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile, type CompileOptions } from '@mdx-js/mdx'
import { baseExpressiveCodeOptions, remarkPlugins } from '@visualplan/compile'
import { pluginFileIcons } from '@visualplan/compile/file-icons'
import { remarkFileTreeIcons } from '@visualplan/compile/filetree-icons'
import { encodePlan } from '@visualplan/core/share'
import rehypeExpressiveCode, { type RehypeExpressiveCodeOptions } from 'rehype-expressive-code'
import { build, createServer, type InlineConfig, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import type { Theme } from '../config.js'

// The shared base options (themes, frames, color chips, ink styling) come from
// `@visualplan/compile` so the CLI and the /view page highlight code identically; the CLI
// appends the Node-only Material file-icons plugin, which reads SVGs from disk and so cannot
// ship to the browser. iconClass lets theme.css size the injected icon.
const expressiveCodeOptions: RehypeExpressiveCodeOptions = {
  ...baseExpressiveCodeOptions,
  plugins: [
    ...(baseExpressiveCodeOptions.plugins ?? []),
    pluginFileIcons({ iconClass: 'vp-file-icon' }),
  ],
}

// The one place MDX is compiled for the render path. The same remark/rehype config drives both the
// one-shot build and the --watch dev server (both go through virtualPlanPlugin), so they cannot
// drift. remarkFileTreeIcons is appended CLI-only: it inlines Material file icons (Node-only, reads
// SVGs from disk) after plan-blocks serializes the FileTree data, so the browser /view path never
// pulls in material-icon-theme and falls back to a generic icon.
const mdxCompileOptions: CompileOptions = {
  providerImportSource: '@mdx-js/react',
  remarkPlugins: [...remarkPlugins, remarkFileTreeIcons],
  rehypePlugins: [[rehypeExpressiveCode, expressiveCodeOptions]],
}

const require = createRequire(import.meta.url)

/** A plan to render: either MDX source in memory (the programmatic API) or a file to read. */
type PlanInput = string | { path: string }

/** Read the plan's current source, BOM-stripped; for a `{ path }` input it re-reads each call so a
 * watched plan reflects its latest saved state. */
function sourceReader(input: PlanInput): () => string {
  if (typeof input === 'string') return () => input
  const { path } = input
  return () => readFileSync(path, 'utf8').replace(/^\ufeff/, '')
}

interface RuntimePaths {
  /** Directory Vite roots at: holds index.html plus the runtime source. */
  runtimeDir: string
  /** Core catalog source, aliased to `@visualplan/core` so the runtime import resolves. */
  coreEntry: string
}

/**
 * Locate the runtime source and the core catalog in both layouts:
 * - Published: both are vendored next to dist/ (`<pkg>/runtime`, `<pkg>/core`).
 * - Dev (workspace): they are sibling packages, resolved via node module resolution.
 * The core path is aliased to `@visualplan/core` in the Vite build, so the runtime's
 * import resolves identically whether the CLI is installed or run from the monorepo.
 */
function findRuntimePaths(): RuntimePaths {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 6; depth++) {
    const runtimeDir = join(dir, 'runtime')
    const coreEntry = join(dir, 'core', 'index.ts')
    // Require BOTH vendored siblings: the monorepo also has a `runtime/index.html`
    // (under packages/), but its core lives at core/src/index.ts, so only the true
    // vendored layout has core/index.ts next to runtime/.
    if (existsSync(join(runtimeDir, 'index.html')) && existsSync(coreEntry)) {
      return { runtimeDir, coreEntry }
    }
    dir = dirname(dir)
  }
  const runtimeDir = dirname(require.resolve('@visualplan/runtime/package.json'))
  const coreDir = dirname(require.resolve('@visualplan/core/package.json'))
  return { runtimeDir, coreEntry: join(coreDir, 'src', 'index.ts') }
}

const VIRTUAL_PLAN_ID = 'virtual:plan'
const RESOLVED_VIRTUAL_PLAN_ID = '\0virtual:plan'

/**
 * Serve the plan as the `virtual:plan` module the runtime imports. The source is compiled with
 * `@mdx-js/mdx` here (not via @mdx-js/rollup) so the plan can be an in-memory string with no file
 * on disk. The compiled module's default export is the MDX component, matching virtual-plan.d.ts.
 * For a `{ path }` input (the --watch dev server) the file is re-read on each load and a save
 * triggers a recompile + full reload via handleHotUpdate.
 */
function virtualPlanPlugin(input: PlanInput): Plugin {
  const readSource = sourceReader(input)
  const watchPath = typeof input === 'string' ? null : resolve(input.path)
  return {
    name: 'visualplan:virtual-plan',
    enforce: 'pre',
    resolveId(id) {
      if (id === VIRTUAL_PLAN_ID) return RESOLVED_VIRTUAL_PLAN_ID
    },
    async load(id) {
      if (id !== RESOLVED_VIRTUAL_PLAN_ID) return null
      if (watchPath) this.addWatchFile(watchPath)
      const compiled = await compile(readSource(), mdxCompileOptions)
      return String(compiled)
    },
    // The plan is a virtual module backed by a file, not a module Vite tracks by path, so a save
    // does NOT invalidate it on its own (addWatchFile adds the file to the watcher but does not
    // trigger invalidation, verified). On a change to the watched plan, invalidate the virtual
    // module and trigger a full reload so --watch reflects the edit. MDX has no HMR boundary, so a
    // full reload is the right granularity.
    handleHotUpdate(ctx) {
      if (!watchPath || resolve(ctx.file) !== watchPath) return
      const mod = ctx.server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_PLAN_ID)
      // Invalidate the compiled module if it has been loaded, then always reload: the reload must
      // fire even before the browser has loaded virtual:plan (e.g. the very first edit), so it is
      // unconditional, not gated on the module being in the graph.
      if (mod) ctx.server.moduleGraph.invalidateModule(mod)
      ctx.server.ws.send({ type: 'full-reload' })
      return []
    },
  }
}

/** The plan's title is its first `# ` heading (plans have no frontmatter). */
function planTitleFromSource(source: string): string {
  // Strip a leading UTF-8 BOM first, or a BOM-prefixed "# Title" first line never matches `^# `.
  return source.replace(/^\ufeff/, '').match(/^# (.+?)\s*$/m)?.[1] ?? 'Plan'
}

/** The plan's title from a file path; falls back to "Plan" if the file is unreadable. */
export function planTitle(mdxPath: string): string {
  try {
    return planTitleFromSource(readFileSync(mdxPath, 'utf8'))
  } catch {
    return 'Plan'
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Set the page `<title>` to the plan's title so the browser tab is named, not "Plan". */
function htmlTitlePlugin(readSource: () => string): Plugin {
  return {
    name: 'visualplan:html-title',
    transformIndexHtml: html =>
      html.replace(
        /<title>[\s\S]*?<\/title>/,
        `<title>${escapeHtml(planTitleFromSource(readSource()))}</title>`,
      ),
  }
}

/** The shape injected onto `globalThis.__VP_SHARE__` for the runtime share button. */
interface PlanShare {
  /** The plan's MDX source, deflated + base64url, for the `?data=` link. */
  data: string
  /** True on the `--watch` dev server, where the link is a point-in-time snapshot. */
  dev: boolean
}

/**
 * Embed the plan's encoded MDX source so the runtime share button can build a
 * stateless `visualplan.dev/view?data=...` link. The source is read fresh on
 * every call, so the `--watch` dev server always reflects the current file:
 * `transformIndexHtml` seeds the initial value, and a `/__vp_share` dev endpoint
 * re-encodes on demand when the button is clicked.
 */
function planSharePlugin(readSource: () => string): Plugin {
  const encode = () => encodePlan(readSource())
  return {
    name: 'visualplan:share',
    configureServer(server) {
      server.middlewares.use('/__vp_share', (_req, res) => {
        try {
          const data = encode()
          res.setHeader('content-type', 'text/plain; charset=utf-8')
          res.setHeader('cache-control', 'no-store')
          res.end(data)
        } catch {
          res.statusCode = 500
          res.end('')
        }
      })
    },
    transformIndexHtml: {
      order: 'pre',
      handler(_html, ctx) {
        const share: PlanShare = { data: encode(), dev: ctx.server != null }
        return [
          {
            tag: 'script',
            injectTo: 'head',
            children: `globalThis.__VP_SHARE__=${JSON.stringify(share)}`,
          },
        ]
      },
    },
  }
}

/** How a plan is rendered, beyond its source. Defaults match the CLI (cog + share both on). */
export interface BuildOptions {
  /** Default color scheme baked into the page. Default `system`. */
  theme?: Theme
  /** Lock the theme: hide the in-page cog and ignore the `localStorage` override, so the rendered
   * theme is fixed. The programmatic API sets this when its caller passes a `theme`. Default false. */
  lockTheme?: boolean
  /** Inject the share button's data. The CLI shares; the programmatic API defaults this off. Default true. */
  enableSharing?: boolean
}

/**
 * An inline `<head>` script that resolves the page's color scheme and sets `<html data-theme>`
 * before the body paints, so a rendered plan honors the configured default with no flash. It runs
 * as a plain (non-module) script during head parse, before the deferred app module. Precedence when
 * unlocked: the per-view `localStorage` override the runtime cog writes, then the injected default,
 * then `system` (the OS); when locked it uses the injected theme directly. It must stay in sync with
 * the runtime's `theme.ts` (same key, same order, same lock behavior).
 */
function themeBootstrap(theme: Theme, lockTheme: boolean): string {
  const config = JSON.stringify({ theme, lockTheme })
  return `globalThis.__VP_CONFIG__=${config};(function(){var c=globalThis.__VP_CONFIG__,d=c.theme,p;if(c.lockTheme){p=d}else{try{p=localStorage.getItem("vp-theme")}catch(e){}if(p!=="light"&&p!=="dark"&&p!=="system")p=d}var dark=p==="dark"||(p==="system"&&typeof matchMedia==="function"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=dark?"dark":"light"})()`
}

/**
 * Inject the default theme and lock flag into the page: the `themeBootstrap` script seeds
 * `globalThis.__VP_CONFIG__` and sets the initial `data-theme`. When unlocked, the runtime cog can
 * override per-view via `localStorage`; when locked the cog is hidden and the theme is fixed.
 */
function planConfigPlugin(theme: Theme, lockTheme: boolean): Plugin {
  return {
    name: 'visualplan:config',
    transformIndexHtml: {
      order: 'pre',
      handler() {
        return [{ tag: 'script', injectTo: 'head', children: themeBootstrap(theme, lockTheme) }]
      },
    },
  }
}

function baseConfig(paths: RuntimePaths, input: PlanInput, options: BuildOptions): InlineConfig {
  const readSource = sourceReader(input)
  const theme = options.theme ?? 'system'
  const lockTheme = options.lockTheme ?? false
  const enableSharing = options.enableSharing ?? true
  const plugins: Plugin[] = [
    virtualPlanPlugin(input),
    htmlTitlePlugin(readSource),
    planConfigPlugin(theme, lockTheme),
  ]
  // The share button renders only when its data is injected, so omitting the plugin hides it.
  if (enableSharing) plugins.push(planSharePlugin(readSource))
  return {
    root: paths.runtimeDir,
    configFile: false,
    logLevel: 'silent',
    resolve: {
      alias: {
        '@visualplan/core': paths.coreEntry,
        // The compiled plan imports react/jsx-runtime and @mdx-js/react, but it is a virtual
        // module with no directory of its own (and a file plan often lives outside any node
        // project), so resolve those from the CLI's own install. Without this a plan in a bare
        // directory fails with "failed to resolve react/jsx-runtime".
        'react/jsx-runtime': require.resolve('react/jsx-runtime'),
        'react/jsx-dev-runtime': require.resolve('react/jsx-dev-runtime'),
        '@mdx-js/react': require.resolve('@mdx-js/react'),
      },
    },
    esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
    plugins,
    // The runtime, core, and (for a file input) the user's plan span sibling dirs (and a hoisted
    // node_modules) in the monorepo, so the dev server cannot use a single allow root. This is a
    // local tool rendering the user's own plan, so fs is unrestricted.
    server: { fs: { strict: false }, open: false },
  }
}

/**
 * Compile a plan's MDX source to a single self-contained HTML page, returned as a string.
 * `options` control the baked theme, whether the theme is locked (cog hidden), and whether the
 * share button is injected (see `BuildOptions`). Defaults match the CLI: `system`, unlocked, shared.
 */
export async function buildHtml(source: string, options: BuildOptions = {}): Promise<string> {
  const paths = findRuntimePaths()
  const outDir = await mkdtemp(join(tmpdir(), 'visualplan-build-'))
  try {
    const config = baseConfig(paths, source, options)
    await build({
      ...config,
      plugins: [...(config.plugins ?? []), viteSingleFile()],
      build: {
        outDir,
        emptyOutDir: true,
        rollupOptions: { input: join(paths.runtimeDir, 'index.html') },
      },
    })
    return await readFile(join(outDir, 'index.html'), 'utf8')
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
}

/** Compile an MDX plan file to a single self-contained HTML file at `outPath`. */
export async function renderToFile(
  mdxPath: string,
  outPath: string,
  theme: Theme = 'system',
): Promise<void> {
  const source = readFileSync(resolve(mdxPath), 'utf8').replace(/^\ufeff/, '')
  await writeFile(resolve(outPath), await buildHtml(source, { theme }))
}

export interface DevServer {
  url: string
  close: () => Promise<void>
}

/** Default port for the `--watch` dev server. A fixed, memorable port avoids colliding with the
 * many other tools that sit on Vite's own 5173 default. Vite still auto-increments if it is taken. */
export const DEFAULT_DEV_PORT = 9140

/** Start a hot-reloading dev server for an MDX plan file and return its local URL. */
export async function startDevServer(
  mdxPath: string,
  theme: Theme = 'system',
  port: number = DEFAULT_DEV_PORT,
): Promise<DevServer> {
  const paths = findRuntimePaths()
  const config = baseConfig(paths, { path: resolve(mdxPath) }, { theme })
  const server = await createServer({ ...config, server: { ...config.server, port } })
  await server.listen()
  const url =
    server.resolvedUrls?.local[0] ?? `http://localhost:${server.config.server.port ?? port}`
  return {
    url,
    close: () => server.close(),
  }
}
