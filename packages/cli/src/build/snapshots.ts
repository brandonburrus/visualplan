/**
 * The per-plan snapshot cache that powers automatic iteration diffing. Each render of a plan *file*
 * stores its source keyed by the file's absolute path; the next render of that same path diffs the
 * new source against the stored snapshot (see `diffSections`) and then overwrites it. So the agent's
 * normal loop (edit the `.mdx` in place, re-present) shows "what changed since you last looked" with
 * no flag to remember. Piped stdin has no stable path key, so it never auto-snapshots.
 *
 * The store lives under `~/.vplan/snapshots/` (alongside the config), is keyed by a hash of the
 * absolute path so the filename is filesystem-safe, and is best-effort: a read miss or a write
 * failure simply means no diff, never a broken render.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { configDir } from '../config.js'

/** `~/.vplan/snapshots` — where the last-presented source of each plan file is cached. */
export const snapshotsDir = join(configDir, 'snapshots')

/** FNV-1a 32-bit hash as hex; a stable, filesystem-safe key for an absolute plan path. */
function hashPath(absPath: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < absPath.length; i++) {
    h ^= absPath.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

/** The snapshot file path for a plan's absolute path within `dir` (defaults to `~/.vplan/snapshots`). */
export function snapshotPath(absPath: string, dir: string = snapshotsDir): string {
  return join(dir, `${hashPath(absPath)}.mdx`)
}

/** The cached previous source for a plan path, or undefined if none is cached (or the read fails). */
export async function readSnapshot(
  absPath: string,
  dir: string = snapshotsDir,
): Promise<string | undefined> {
  try {
    return await readFile(snapshotPath(absPath, dir), 'utf8')
  } catch {
    return undefined
  }
}

/** Cache `source` as the last-presented version of a plan path. Best-effort: a write failure is
 * swallowed, since a missing snapshot only costs a diff, never a render. */
export async function writeSnapshot(
  absPath: string,
  source: string,
  dir: string = snapshotsDir,
): Promise<void> {
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(snapshotPath(absPath, dir), source)
  } catch {
    // A cache write failure must never fail the render that triggered it.
  }
}
