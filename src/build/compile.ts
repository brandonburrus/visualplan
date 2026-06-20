import { cp, mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import mdx from '@mdx-js/rollup'
import rehypeExpressiveCode, { type RehypeExpressiveCodeOptions } from 'rehype-expressive-code'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import { build, createServer, type InlineConfig, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { remarkMermaid } from './remark-mermaid.js'

const expressiveCodeOptions: RehypeExpressiveCodeOptions = {
  themes: ['github-dark', 'github-light'],
  useDarkModeMediaQuery: true,
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

/**
 * Locate the shipped `runtime/` directory by walking up from this module.
 * Works both in dev (src/build) and after bundling (dist/index.js), since the
 * runtime always sits one level under the package root next to the build output.
 */
function findRuntimeDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 6; depth++) {
    const candidate = join(dir, 'runtime', 'index.html')
    if (existsSync(candidate)) return join(dir, 'runtime')
    dir = dirname(dir)
  }
  throw new Error('VisualPlan: could not locate the runtime directory')
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
        // Must run before rehype-expressive-code so mermaid never reaches the highlighter.
        remarkMermaid,
      ],
      rehypePlugins: [[rehypeExpressiveCode, expressiveCodeOptions]],
    }),
  }
}

function baseConfig(runtimeDir: string, mdxPath: string): InlineConfig {
  return {
    root: runtimeDir,
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: { 'virtual:plan': mdxPath } },
    esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
    plugins: [mdxPlugin()],
    server: { fs: { allow: [runtimeDir, dirname(mdxPath)] }, open: false },
  }
}

/** Compile an MDX plan to a single self-contained HTML file at `outPath`. */
export async function renderToFile(mdxPath: string, outPath: string): Promise<void> {
  const runtimeDir = findRuntimeDir()
  const absMdx = resolve(mdxPath)
  const outDir = await mkdtemp(join(tmpdir(), 'visualplan-build-'))
  try {
    const config = baseConfig(runtimeDir, absMdx)
    await build({
      ...config,
      plugins: [...(config.plugins ?? []), viteSingleFile()],
      build: {
        outDir,
        emptyOutDir: true,
        rollupOptions: { input: join(runtimeDir, 'index.html') },
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
  const runtimeDir = findRuntimeDir()
  const absMdx = resolve(mdxPath)
  const server = await createServer(baseConfig(runtimeDir, absMdx))
  await server.listen()
  const url =
    server.resolvedUrls?.local[0] ?? `http://localhost:${server.config.server.port ?? 5173}`
  return {
    url,
    close: () => server.close(),
  }
}
