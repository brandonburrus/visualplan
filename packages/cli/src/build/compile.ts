import { cp, mkdtemp, rm } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import mdx from '@mdx-js/rollup'
import { pluginColorChips } from 'expressive-code-color-chips'
import rehypeExpressiveCode, { type RehypeExpressiveCodeOptions } from 'rehype-expressive-code'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import { build, createServer, type InlineConfig, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { pluginFileIcons } from './expressive-code-file-icons.js'
import { remarkMath } from './remark-math.js'
import { remarkMermaid } from './remark-mermaid.js'
import { remarkPlanBlocks } from './remark-plan-blocks.js'

const expressiveCodeOptions: RehypeExpressiveCodeOptions = {
  themes: ['github-dark', 'github-light'],
  useDarkModeMediaQuery: true,
  // Color chips render a swatch next to CSS color values; our file-icons plugin adds a Material
  // Icon Theme file-type icon to a block's title bar. Both inline their markup/SVG at build time
  // (no external asset), so the single-file output stays self-contained. iconClass lets theme.css
  // size the icon.
  plugins: [pluginColorChips(), pluginFileIcons({ iconClass: 'vp-file-icon' })],
  // The copy-button script does not execute reliably in our client-rendered SPA;
  // frames (titles) are CSS-only, so keep those and drop the interactive button.
  frames: { showCopyToClipboardButton: false },
  // Match the flat ink design: our borders/radius/surfaces/fonts, no shadow, no
  // colored tab accent. Values are CSS vars so the frame chrome tracks light/dark too.
  styleOverrides: {
    borderRadius: '10px',
    borderColor: 'var(--vp-border)',
    codeBackground: 'var(--vp-surface)',
    codeFontFamily: 'var(--vp-mono)',
    codeFontSize: '0.8rem',
    codeLineHeight: '1.6',
    codePaddingBlock: '0.9rem',
    codePaddingInline: '1rem',
    uiFontFamily: 'var(--vp-font)',
    uiFontSize: '0.78rem',
    frames: {
      frameBoxShadowCssValue: 'none',
      // A flat filename header on the same surface as the code, separated by one
      // border. No editor-tab metaphor, no colored indicator line.
      editorBackground: 'var(--vp-surface)',
      editorTabBarBackground: 'var(--vp-surface)',
      editorTabBarBorderBottomColor: 'var(--vp-border)',
      editorActiveTabBackground: 'var(--vp-surface)',
      editorActiveTabForeground: 'var(--vp-muted)',
      editorActiveTabBorderColor: 'transparent',
      editorActiveTabIndicatorTopColor: 'transparent',
      editorActiveTabIndicatorBottomColor: 'transparent',
      editorTabsMarginInlineStart: '0',
      terminalBackground: 'var(--vp-surface)',
      terminalTitlebarBackground: 'var(--vp-surface)',
      terminalTitlebarForeground: 'var(--vp-muted)',
      terminalTitlebarBorderBottomColor: 'var(--vp-border)',
    },
  },
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
      remarkPlugins: [
        remarkFrontmatter,
        [remarkMdxFrontmatter, { name: 'frontmatter' }],
        remarkGfm,
        // Parse markdown-list children of the list components into data props. Must run
        // after remark-gfm (for task-list checked state) and before the JSX is compiled.
        remarkPlanBlocks,
        // Both must run before rehype-expressive-code so mermaid/math never reach the highlighter.
        remarkMermaid,
        remarkMath,
      ],
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
    plugins: [mdxPlugin(), htmlTitlePlugin(mdxPath)],
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
