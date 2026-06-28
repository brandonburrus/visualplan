/**
 * Client-side "connect or start" for the Review Queue daemon. A `vplan review`/`render --review`
 * invocation calls this to obtain a daemon port: if a lock points at a live daemon, reuse it;
 * otherwise spawn the daemon as a detached background process and poll until it answers. Racing
 * callers may both spawn, but the daemon's lock mutex collapses them to one; after spawning, a lock
 * for a different alive port is adopted.
 */
import { spawn as spawnChild } from 'node:child_process'
import { configDir as defaultConfigDir } from '../config.js'
import { isDaemonAlive, readLock } from './lockfile.js'
import { resolveCliEntry } from './cli-entry.js'

/** Default daemon port, distinct from the dev/review server's 9140 so a daemon and a one-shot
 * `--watch`/`--no-daemon` review can coexist. The daemon increments from here if the port is taken. */
export const DEFAULT_DAEMON_PORT = 9151

export interface EnsureDaemonOptions {
  /** Config/lock directory; defaults to the real `~/.vplan`. */
  configDir?: string
  /** Idle TTL passed to a freshly spawned daemon. */
  idleMs: number
  /** Port to ask a freshly spawned daemon to bind; defaults to `DEFAULT_DAEMON_PORT`. */
  defaultPort?: number
  /** Max time to poll for a spawned daemon to come alive before giving up. */
  pollTimeoutMs?: number
  /** Spawns the detached daemon process; injectable for tests. Defaults to the real spawn. */
  spawn?: (port: number, idleMs: number) => void | Promise<void>
}

/** Default spawn: launch this CLI's own entry as a detached `__review-daemon` process and unref it
 * so the foreground CLI can exit independently. */
function spawnDaemonProcess(port: number, idleMs: number): void {
  const entry = resolveCliEntry()
  spawnChild(
    process.execPath,
    [entry, '__review-daemon', '--port', String(port), '--idle', String(idleMs)],
    { detached: true, stdio: 'ignore' },
  ).unref()
}

/** Resolve the daemon's port, starting it if necessary. */
export async function ensureDaemon(opts: EnsureDaemonOptions): Promise<{ port: number }> {
  const dir = opts.configDir ?? defaultConfigDir
  const port = opts.defaultPort ?? DEFAULT_DAEMON_PORT
  const pollTimeoutMs = opts.pollTimeoutMs ?? 10_000
  const spawn = opts.spawn ?? spawnDaemonProcess

  // Fast path: a lock pointing at a live daemon means reuse it, no spawn.
  const existing = await readLock(dir)
  if (existing && (await isDaemonAlive(existing.port))) {
    return { port: existing.port }
  }

  // No live daemon: start one (best-effort; a racing caller may also spawn, the lock mutex resolves
  // it) and poll until the lock names an alive daemon. The winning daemon's port may differ from the
  // one we asked for (another caller won, or the daemon incremented past a taken port).
  await spawn(port, opts.idleMs)

  const deadline = Date.now() + pollTimeoutMs
  while (Date.now() < deadline) {
    const lock = await readLock(dir)
    if (lock && (await isDaemonAlive(lock.port))) {
      return { port: lock.port }
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('Review Queue daemon did not come alive in time')
}
