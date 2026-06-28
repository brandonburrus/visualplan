/**
 * Resolve the path to this CLI's own entry script, so the detached daemon can be launched as
 * `node <entry> __review-daemon ...`. This is environment-sensitive: in production the CLI runs from
 * the built `dist/index.js`, in dev from `tsx src/index.ts`. `process.argv[1]` is the script Node
 * was started with in both cases (the bin shim resolves to dist/index.js when installed), so it is
 * the most robust single source; the `import.meta.url` of this module is the fallback when argv[1]
 * is somehow absent (it points into the same build, so resolving `../index.js` from here lands on
 * the CLI entry next to the compiled output).
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function resolveCliEntry(): string {
  const fromArgv = process.argv[1]
  if (fromArgv) return fromArgv
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'index.js')
}
