import { cp, mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import mdx from '@mdx-js/rollup'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import { build, createServer, type InlineConfig, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

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
      ],
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
