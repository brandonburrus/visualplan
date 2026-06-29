// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runReviewDaemon } from '../src/commands/review-daemon.js'
import { readLock, writeLockExclusive } from '../src/review/lockfile.js'
import type { DaemonInstance } from '../src/review/daemon.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'visualplan-daemon-cmd-test-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** A fake daemon that records close() and lets the test control its bound port. */
function fakeInstance(port: number): DaemonInstance & { closed: boolean } {
  const inst = {
    port,
    closed: false,
    close: async () => {
      inst.closed = true
    },
  }
  return inst
}

describe('runReviewDaemon', () => {
  it('starts the daemon and writes the lock with the bound port and pid (golden)', async () => {
    const inst = fakeInstance(9151)
    await runReviewDaemon(
      { port: 9151, idleMs: 1000 },
      { configDir: dir, startDaemon: async () => inst, isAlive: async () => false },
    )
    expect(await readLock(dir)).toEqual({ port: 9151, pid: process.pid })
    expect(inst.closed).toBe(false)
  })

  it('closes the daemon and does not overwrite the lock when it loses the mutex race (error)', async () => {
    // Another daemon already owns the lock with a DIFFERENT port; the loser must close and leave it.
    await writeLockExclusive({ port: 8000, pid: 111 }, dir)
    const inst = fakeInstance(9151)
    await runReviewDaemon(
      { port: 9151, idleMs: 1000 },
      { configDir: dir, startDaemon: async () => inst, isAlive: async () => true },
    )
    expect(inst.closed).toBe(true)
    expect(await readLock(dir)).toEqual({ port: 8000, pid: 111 })
  })

  it('clears a stale lock then acquires it on retry (edge)', async () => {
    // A leftover lock points at a dead daemon (isAlive false); the daemon clears it and wins.
    await writeLockExclusive({ port: 8000, pid: 111 }, dir)
    const inst = fakeInstance(9151)
    await runReviewDaemon(
      { port: 9151, idleMs: 1000 },
      { configDir: dir, startDaemon: async () => inst, isAlive: async () => false },
    )
    expect(inst.closed).toBe(false)
    expect(await readLock(dir)).toEqual({ port: 9151, pid: process.pid })
  })
})
