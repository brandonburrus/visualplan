import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Render the committed example plans (`packages/app/examples/*.mdx`) to self-contained HTML in
 * `public/examples/` with the real `vplan` CLI, so the docs site hosts authentic rendered plans
 * (never stale). The output is git-ignored and regenerated on every build; CI builds the CLI
 * (`pnpm --filter vplan build`) before the app build runs this.
 */
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(appDir, '..', '..')
const cliBin = join(repoRoot, 'packages', 'cli', 'dist', 'index.js')
const examplesDir = join(appDir, 'examples')
const outDir = join(appDir, 'public', 'examples')

if (!existsSync(cliBin)) {
  console.error(`build-examples: vplan CLI not built at ${cliBin}`)
  console.error('Run `pnpm --filter vplan build` first, then re-run the app build.')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
const files = readdirSync(examplesDir).filter(name => name.endsWith('.mdx'))
for (const file of files) {
  const slug = file.replace(/\.mdx$/, '')
  execFileSync(
    'node',
    [cliBin, join(examplesDir, file), '--no-open', '--out', join(outDir, `${slug}.html`)],
    {
      stdio: 'inherit',
    },
  )
  console.log(`build-examples: rendered ${slug}.html`)
}
console.log(`build-examples: ${files.length} example(s) rendered to public/examples/`)
