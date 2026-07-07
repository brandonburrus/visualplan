/**
 * The hidden `__review-daemon` command: the body of the detached daemon process that `ensureDaemon`
 * spawns. It owns the lock mutex. It starts the HTTP daemon, then atomically claims the lock; if
 * another daemon won the race it closes and exits, and if it finds only a stale lock (present but
 * pointing at a dead daemon) it clears it and retries once. While the daemon runs, its HTTP server
 * keeps the event loop alive; on idle/shell-close shutdown or a SIGTERM/SIGINT it removes its own
 * lock and exits. Binding necessarily precedes the lock claim (the port is unknowable pre-bind);
 * the lock's `wx` mutex is what collapses two daemons racing through that window down to one.
 */
import { mkdir } from 'node:fs/promises'
import { type DaemonInstance, startDaemon } from '../review/daemon.js'
import {
  isDaemonAlive,
  readLock,
  removeLock,
  removeLockIfOwned,
  writeLockExclusive,
} from '../review/lockfile.js'
import { buildQueueShell } from '../build/queue-shell.js'
import { configDir as defaultConfigDir } from '../config.js'

export interface RunReviewDaemonOptions {
  port: number
  idleMs: number
}

/** Injectable seams so the mutex/stale-lock/signal logic is unit-testable without a real Vite
 * build, a real port bind, real signal delivery, or `process.exit`. Production uses the real
 * implementations. */
export interface ReviewDaemonDeps {
  configDir?: string
  startDaemon?: (
    port: number,
    idleMs: number,
    onIdle: () => void | Promise<void>,
  ) => Promise<DaemonInstance>
  isAlive?: (port: number) => Promise<boolean>
  onSignal?: (signal: 'SIGTERM' | 'SIGINT', handler: () => void) => void
  exit?: (code: number) => void
}

/** Start the real HTTP daemon on `port`, incrementing past a port taken by a non-daemon (EADDRINUSE)
 * up to a few tries. Wires the real shell builder and the idle/shutdown callback. */
async function startRealDaemon(
  port: number,
  idleMs: number,
  onIdle: () => void | Promise<void>,
): Promise<DaemonInstance> {
  let lastError: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await startDaemon({
        port: port + attempt,
        idleMs,
        getShellHtml: buildQueueShell,
        onIdle,
      })
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'EADDRINUSE') {
        lastError = error
        continue
      }
      throw error
    }
  }
  throw lastError ?? new Error('could not bind a daemon port')
}

export async function runReviewDaemon(
  opts: RunReviewDaemonOptions,
  deps: ReviewDaemonDeps = {},
): Promise<void> {
  // The detached daemon shares the lock/state dir with the `ensureDaemon` callers that spawn it. In
  // production that is `~/.vplan` for both; `VPLAN_REVIEW_DIR` overrides it (the spawn passes it in)
  // so a test can point a real daemon process and its caller at the same temp dir.
  const dir = deps.configDir ?? process.env.VPLAN_REVIEW_DIR ?? defaultConfigDir
  const start = deps.startDaemon ?? startRealDaemon
  const isAlive = deps.isAlive ?? isDaemonAlive
  const onSignal = deps.onSignal ?? ((signal, handler) => process.on(signal, handler))
  const exit = deps.exit ?? ((code: number) => process.exit(code))
  // The lock dir must exist before the `wx` write; the daemon owns creating `~/.vplan`.
  await mkdir(dir, { recursive: true })

  // The daemon removes its lock on shutdown so the next invocation starts fresh. Owned-only: a
  // SIGTERM'd old daemon must not delete a lock a successor already claimed. `shutdown()` awaits
  // this, so the lock is provably gone before close() resolves.
  const onIdle = () => removeLockIfOwned(dir, process.pid)

  const instance = await start(opts.port, opts.idleMs, onIdle)

  // Claim the lock. If a live daemon already owns it, this process lost the race: close and bow out.
  if (await acquireLock(dir, instance.port, isAlive)) {
    // Only the lock owner listens for signals: a graceful stop closes the instance (which removes
    // the lock via the awaited onIdle) and then exits cleanly.
    const handler = (): void => {
      void instance.close().then(() => exit(0))
    }
    onSignal('SIGTERM', handler)
    onSignal('SIGINT', handler)
    return
  }
  await instance.close()
}

/**
 * Try to atomically claim the lock for this daemon. Returns true on success. On a pre-existing lock,
 * checks liveness: a live owner means we lost (false); a stale lock (dead owner) is cleared and the
 * claim retried once.
 */
async function acquireLock(
  dir: string,
  port: number,
  isAlive: (port: number) => Promise<boolean>,
): Promise<boolean> {
  if (await writeLockExclusive({ port, pid: process.pid }, dir)) return true

  const existing = await readLock(dir)
  if (existing && (await isAlive(existing.port))) return false

  // Stale lock pointing at a dead daemon: clear it and retry the claim once.
  await removeLock(dir)
  return writeLockExclusive({ port, pid: process.pid }, dir)
}
