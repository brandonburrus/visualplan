// @vitest-environment node
import { spawn as spawnChild } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureDaemon } from '../src/review/ensure-daemon.js'
import { readLock, removeLock, writeLockExclusive } from '../src/review/lockfile.js'

let dir: string
let servers: Server[]

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'visualplan-ensure-test-'))
  servers = []
})

afterEach(async () => {
  for (const s of servers) await new Promise<void>(resolve => s.close(() => resolve()))
  await rm(dir, { recursive: true, force: true })
})

/** A bare server that answers /__vp_ping 200, standing in for a live daemon on a real port. */
async function pingServer(): Promise<number> {
  const server = createServer((req, res) => {
    if (req.url === '/__vp_ping') {
      res.writeHead(200)
      res.end('ok')
      return
    }
    res.writeHead(404)
    res.end()
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, resolve))
  return (server.address() as { port: number }).port
}

describe('ensureDaemon', () => {
  it('reuses an existing alive daemon without spawning (golden)', async () => {
    const port = await pingServer()
    await writeLockExclusive({ port, pid: 999 }, dir)
    let spawned = false
    const result = await ensureDaemon({
      configDir: dir,
      idleMs: 1000,
      spawn: () => {
        spawned = true
      },
    })
    expect(result.port).toBe(port)
    expect(spawned).toBe(false)
  })

  it('spawns and polls when no lock exists, then returns the new daemon port (golden)', async () => {
    const port = await pingServer()
    const result = await ensureDaemon({
      configDir: dir,
      idleMs: 1000,
      defaultPort: port,
      // The "spawn" writes the lock the way the real detached daemon would, so polling discovers it.
      spawn: async (p: number) => {
        await writeLockExclusive({ port: p, pid: 123 }, dir)
      },
    })
    expect(result.port).toBe(port)
  })

  it('throws when the spawned daemon never comes alive (error)', async () => {
    // Bind then immediately free a port so connections are refused; a spawn that does nothing leaves
    // the daemon dead, so polling times out and ensureDaemon gives up.
    const probe = createServer()
    await new Promise<void>(resolve => probe.listen(0, resolve))
    const deadPort = (probe.address() as { port: number }).port
    await new Promise<void>(resolve => probe.close(() => resolve()))
    await expect(
      ensureDaemon({
        configDir: dir,
        idleMs: 1000,
        defaultPort: deadPort,
        pollTimeoutMs: 600,
        spawn: () => {
          /* spawn does nothing: the daemon never starts */
        },
      }),
    ).rejects.toThrow(/daemon/i)
  })

  it('uses a different alive port discovered in the lock after a race (edge)', async () => {
    // Simulate another caller's daemon winning: spawn writes a lock pointing at a DIFFERENT alive
    // port than the one we asked for, and ensureDaemon adopts it.
    const winner = await pingServer()
    const result = await ensureDaemon({
      configDir: dir,
      idleMs: 1000,
      defaultPort: winner + 1, // we asked for a port nobody is on
      spawn: async () => {
        await writeLockExclusive({ port: winner, pid: 7 }, dir)
      },
    })
    expect(result.port).toBe(winner)
  })
})

// Gated off by default (deterministic suite): set VP_DAEMON_E2E=1 to spawn REAL detached daemon
// processes from the built `dist/index.js` and prove ensureDaemon starts one and connects end to
// end, AND that two simultaneous launches collapse to a single surviving daemon (the lock mutex).
// This is the race the design hinges on, so it is exercised against the real process, not a stub.
// Requires `pnpm build` first (the detached child runs the compiled CLI entry); the human runs it
// with VP_DAEMON_E2E=1. A short idle TTL means any orphan self-exits; we also kill by lock pid.
describe.skipIf(!process.env.VP_DAEMON_E2E)('ensureDaemon real spawn (gated)', () => {
  // The built CLI entry the detached daemon runs. Under vitest process.argv[1] is the test runner,
  // not vplan, so we point the spawn at dist/index.js explicitly (in a real install argv[1] is the
  // bin shim, which resolves there on its own).
  const builtEntry = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'index.js')
  const IDLE_MS = 4000

  function realSpawn(port: number, idleMs: number): void {
    spawnChild(
      process.execPath,
      [builtEntry, '__review-daemon', '--port', String(port), '--idle', String(idleMs)],
      // Point the daemon's lock/state dir at this test's temp dir so it and ensureDaemon agree.
      { detached: true, stdio: 'ignore', env: { ...process.env, VPLAN_REVIEW_DIR: dir } },
    ).unref()
  }

  /** Kill whatever daemon the lock points at and clear the lock, so a test never leaks a process. */
  async function killDaemon(): Promise<void> {
    const lock = await readLock(dir)
    if (!lock) return
    try {
      process.kill(lock.pid)
    } catch {
      // Already gone (lost the race and exited, or self-exited on idle); nothing to kill.
    }
    await removeLock(dir)
  }

  afterEach(killDaemon)

  it('spawns the actual detached daemon and connects to it', async () => {
    const { port } = await ensureDaemon({
      configDir: dir,
      idleMs: IDLE_MS,
      defaultPort: 9171,
      spawn: realSpawn,
    })
    const res = await fetch(`http://localhost:${port}/__vp_ping`)
    expect(res.status).toBe(200)
  }, 30_000)

  it('collapses two simultaneous launches to one surviving daemon (race)', async () => {
    // Both callers see no lock and each spawns a real daemon on the same preferred port. The OS lets
    // only one bind it; the other increments, loses the lock mutex, and exits. Both callers must end
    // up pointed at the SAME surviving daemon, and exactly one lock must remain.
    const [a, b] = await Promise.all([
      ensureDaemon({ configDir: dir, idleMs: IDLE_MS, defaultPort: 9181, spawn: realSpawn }),
      ensureDaemon({ configDir: dir, idleMs: IDLE_MS, defaultPort: 9181, spawn: realSpawn }),
    ])
    expect(a.port).toBe(b.port)
    const res = await fetch(`http://localhost:${a.port}/__vp_ping`)
    expect(res.status).toBe(200)

    // The lock names the survivor, and the loser must have exited: only one daemon answers across
    // the small port window the loser might have transiently bound.
    const lock = await readLock(dir)
    expect(lock?.port).toBe(a.port)
    const loserAlive = await fetch(`http://localhost:${a.port + 1}/__vp_ping`).then(
      r => r.ok,
      () => false,
    )
    expect(loserAlive).toBe(false)
  }, 30_000)
})
