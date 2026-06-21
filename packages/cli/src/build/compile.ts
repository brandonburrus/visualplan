import { cp, mkdtemp, rm } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import mdx from '@mdx-js/rollup'
import { baseExpressiveCodeOptions, remarkPlugins } from '@visualplan/compile'
import { pluginFileIcons } from '@visualplan/compile/file-icons'
import { encodePlan } from '@visualplan/core/share'
import rehypeExpressiveCode, { type RehypeExpressiveCodeOptions } from 'rehype-expressive-code'
import { build, createServer, type InlineConfig, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

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

const require = createRequire(import.meta.url)

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

function mdxPlugin(): Plugin {
  return {
    enforce: 'pre',
    ...mdx({
      providerImportSource: '@mdx-js/react',
      // The ordered list (frontmatter, gfm, plan-blocks, mermaid, math) is shared with the
      // /view browser compiler via @visualplan/compile so both render plans identically.
      remarkPlugins,
      rehypePlugins: [[rehypeExpressiveCode, expressiveCodeOptions]],
    }),
  }
}

/** The plan's title is its first `# ` heading (plans have no frontmatter). */
export function planTitle(mdxPath: string): string {
  try {
    // Strip a leading UTF-8 BOM first, or a BOM-prefixed "# Title" first line never matches `^# `.
    const source = readFileSync(mdxPath, 'utf8').replace(/^\ufeff/, '')
    return source.match(/^# (.+?)\s*$/m)?.[1] ?? 'Plan'
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
function htmlTitlePlugin(mdxPath: string): Plugin {
  const title = escapeHtml(planTitle(mdxPath))
  return {
    name: 'visualplan:html-title',
    transformIndexHtml: html => html.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`),
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
 * every call (BOM-stripped to match `planTitle`), so the `--watch` dev server
 * always reflects the current file: `transformIndexHtml` seeds the initial value,
 * and a `/__vp_share` dev endpoint re-encodes on demand when the button is clicked.
 */
function planSharePlugin(mdxPath: string): Plugin {
  const encode = () => encodePlan(readFileSync(mdxPath, 'utf8').replace(/^\ufeff/, ''))
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

function baseConfig(paths: RuntimePaths, mdxPath: string): InlineConfig {
  return {
    root: paths.runtimeDir,
    configFile: false,
    logLevel: 'silent',
    resolve: {
      alias: {
        'virtual:plan': mdxPath,
        '@visualplan/core': paths.coreEntry,
        // The plan .mdx lives anywhere on disk, often outside any node project, but
        // @mdx-js/rollup makes it import react/jsx-runtime and @mdx-js/react. Those
        // are attributed to the plan's own directory, which usually has no
        // node_modules, so resolve them from the CLI's install instead. Without this
        // a plan in a bare directory fails with "failed to resolve react/jsx-runtime".
        'react/jsx-runtime': require.resolve('react/jsx-runtime'),
        'react/jsx-dev-runtime': require.resolve('react/jsx-dev-runtime'),
        '@mdx-js/react': require.resolve('@mdx-js/react'),
      },
    },
    esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
    plugins: [mdxPlugin(), htmlTitlePlugin(mdxPath), planSharePlugin(mdxPath)],
    // The runtime, core, and the user's plan span sibling dirs (and a hoisted
    // node_modules) in the monorepo, so the dev server cannot use a single allow
    // root. This is a local tool rendering the user's own file, so fs is unrestricted.
    server: { fs: { strict: false }, open: false },
  }
}

/** Compile an MDX plan to a single self-contained HTML file at `outPath`. */
export async function renderToFile(mdxPath: string, outPath: string): Promise<void> {
  const paths = findRuntimePaths()
  const absMdx = resolve(mdxPath)
  const outDir = await mkdtemp(join(tmpdir(), 'visualplan-build-'))
  try {
    const config = baseConfig(paths, absMdx)
    await build({
      ...config,
      plugins: [...(config.plugins ?? []), viteSingleFile()],
      build: {
        outDir,
        emptyOutDir: true,
        rollupOptions: { input: join(paths.runtimeDir, 'index.html') },
      },
    })
    await cp(join(outDir, 'index.html'), resolve(outPath))
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
}

export interface DevServer {
  url: string
  close: () => Promise<void>
}

/** Start a hot-reloading dev server for an MDX plan and return its local URL. */
export async function startDevServer(mdxPath: string): Promise<DevServer> {
  const paths = findRuntimePaths()
  const absMdx = resolve(mdxPath)
  const server = await createServer(baseConfig(paths, absMdx))
  await server.listen()
  const url =
    server.resolvedUrls?.local[0] ?? `http://localhost:${server.config.server.port ?? 5173}`
  return {
    url,
    close: () => server.close(),
  }
}
