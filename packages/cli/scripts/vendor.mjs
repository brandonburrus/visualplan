import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Vendor the private workspace packages into this (published) package so the
 * single `vplan` tarball is self-contained.
 *
 * The runtime is compiled from SOURCE by Vite at render time, so the published
 * package must physically contain those source files plus the core catalog the
 * runtime imports. We copy `packages/runtime` -> `cli/runtime` and the core
 * entry -> `cli/core/index.ts`; `compile.ts` aliases `@visualplan/core` to the
 * vendored core in the Vite build. Both `cli/runtime` and `cli/core` are
 * git-ignored generated output.
 */
const cliDir = dirname(dirname(fileURLToPath(import.meta.url)))
const packagesDir = dirname(cliDir)
const repoRoot = dirname(packagesDir)
const runtimeSrc = join(packagesDir, 'runtime')
const coreSrc = join(packagesDir, 'core', 'src', 'index.ts')
const readmeSrc = join(repoRoot, 'README.md')

const runtimeDest = join(cliDir, 'runtime')
const coreDest = join(cliDir, 'core', 'index.ts')
const readmeDest = join(cliDir, 'README.md')

await rm(runtimeDest, { recursive: true, force: true })
await rm(join(cliDir, 'core'), { recursive: true, force: true })

await cp(runtimeSrc, runtimeDest, {
  recursive: true,
  filter: src => {
    const rel = src.slice(runtimeSrc.length)
    if (rel.startsWith('/node_modules') || rel.startsWith('/tests')) return false
    return !/\/(package\.json|tsconfig\.json|vitest\.config\.ts|AGENTS\.md)$/.test(rel)
  },
})

await mkdir(dirname(coreDest), { recursive: true })
await cp(coreSrc, coreDest)

// npm renders the README from the published package's own dir, so copy the root one in.
await cp(readmeSrc, readmeDest)

process.stdout.write(`vendored runtime + core + README into ${cliDir}\n`)
