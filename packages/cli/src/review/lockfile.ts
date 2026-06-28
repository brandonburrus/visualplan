/**
 * Discovery + mutex for the single machine-wide Review Queue daemon. The lock file at
 * `~/.vplan/review-daemon.json` is how a fresh CLI invocation finds an already-running daemon (read
 * the port, ping it) and how two racing invocations agree on one daemon: `writeLockExclusive` uses
 * the `wx` open flag so the write itself is the atomic claim. `dir` overrides the directory for
 * tests, mirroring `config.ts`.
 */
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { configDir } from '../config.js'

/** The daemon's advertised endpoint: the port it serves on and the pid that owns it. */
export interface DaemonLock {
  port: number
  pid: number
}

/** Path to the lock file within `dir` (defaults to the real `~/.vplan`). */
function lockPath(dir: string = configDir): string {
  return join(dir, 'review-daemon.json')
}

/**
 * Read the daemon lock, or null when it is absent or unparseable. A garbage lock (a half-written
 * file, a leftover from a crash) must read as "no daemon" so discovery falls through to starting a
 * fresh one rather than crashing.
 */
export async function readLock(dir: string = configDir): Promise<DaemonLock | null> {
  try {
    const parsed = JSON.parse(await readFile(lockPath(dir), 'utf8')) as Partial<DaemonLock>
    if (typeof parsed?.port === 'number' && typeof parsed?.pid === 'number') {
      return { port: parsed.port, pid: parsed.pid }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Atomically claim the daemon lock. Returns true if this writer created the file, false if it
 * already existed (another daemon won). The `wx` flag makes the create-or-fail a single syscall, so
 * two daemons racing to start collapse to one without a separate check-then-write window. The dir is
 * not created here: the daemon writes the lock only after `~/.vplan` exists (the daemon process
 * ensures it), and tests pass a real temp dir.
 */
export async function writeLockExclusive(
  lock: DaemonLock,
  dir: string = configDir,
): Promise<boolean> {
  try {
    await writeFile(lockPath(dir), `${JSON.stringify(lock)}\n`, { flag: 'wx' })
    return true
  } catch {
    return false
  }
}

/** Remove the lock if present; a no-op when it is already gone (force). */
export async function removeLock(dir: string = configDir): Promise<void> {
  await rm(lockPath(dir), { force: true })
}

/**
 * Probe whether a daemon is actually listening on `port` by hitting its liveness endpoint, true iff
 * it answers 200. A short timeout via AbortController keeps discovery snappy and treats a dead or
 * stale port (connection refused, no response) as not-alive rather than hanging.
 */
export async function isDaemonAlive(port: number, timeoutMs = 500): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`http://localhost:${port}/__vp_ping`, { signal: controller.signal })
    return res.status === 200
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
