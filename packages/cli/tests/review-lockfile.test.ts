// @vitest-environment node
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isDaemonAlive, readLock, removeLock, writeLockExclusive } from '../src/review/lockfile.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'visualplan-lock-test-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('writeLockExclusive', () => {
  it('writes the lock and round-trips via readLock (golden)', async () => {
    expect(await writeLockExclusive({ port: 9151, pid: 42 }, dir)).toBe(true)
    expect(await readLock(dir)).toEqual({ port: 9151, pid: 42 })
  })

  it('refuses a second write when the lock already exists (error: the mutex)', async () => {
    expect(await writeLockExclusive({ port: 9151, pid: 1 }, dir)).toBe(true)
    expect(await writeLockExclusive({ port: 9152, pid: 2 }, dir)).toBe(false)
    // The first writer's value is preserved; the loser did not clobber it.
    expect(await readLock(dir)).toEqual({ port: 9151, pid: 1 })
  })

  it('lets exactly one of two concurrent writers win the race (edge)', async () => {
    const results = await Promise.all([
      writeLockExclusive({ port: 9151, pid: 1 }, dir),
      writeLockExclusive({ port: 9152, pid: 2 }, dir),
    ])
    expect(results.filter(Boolean)).toHaveLength(1)
  })
})

describe('readLock', () => {
  it('returns null when no lock exists (edge)', async () => {
    expect(await readLock(dir)).toBeNull()
  })

  it('returns null for a malformed lock file (error)', async () => {
    await writeLockExclusive({ port: 9151, pid: 1 }, dir)
    await removeLock(dir)
    // A truncated/garbage lock must read as absent, not crash discovery.
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(dir, 'review-daemon.json'), '{ not json')
    expect(await readLock(dir)).toBeNull()
  })
})

describe('removeLock', () => {
  it('removes an existing lock so a fresh write succeeds (golden)', async () => {
    await writeLockExclusive({ port: 9151, pid: 1 }, dir)
    await removeLock(dir)
    expect(await readLock(dir)).toBeNull()
    expect(await writeLockExclusive({ port: 9152, pid: 2 }, dir)).toBe(true)
  })

  it('is a no-op when there is no lock (edge)', async () => {
    await expect(removeLock(dir)).resolves.toBeUndefined()
  })
})

describe('isDaemonAlive', () => {
  it('returns true when /__vp_ping answers 200 (golden)', async () => {
    const server = createServer((req, res) => {
      if (req.url === '/__vp_ping') {
        res.writeHead(200)
        res.end('ok')
        return
      }
      res.writeHead(404)
      res.end()
    })
    await new Promise<void>(resolve => server.listen(0, resolve))
    const port = (server.address() as { port: number }).port
    try {
      expect(await isDaemonAlive(port)).toBe(true)
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('returns false when nothing is listening on the port (error)', async () => {
    // Bind a port, capture it, then release it so the connection is refused.
    const probe = createServer()
    await new Promise<void>(resolve => probe.listen(0, resolve))
    const port = (probe.address() as { port: number }).port
    await new Promise<void>(resolve => probe.close(() => resolve()))
    expect(await isDaemonAlive(port)).toBe(false)
  })

  it('returns false when the endpoint answers non-200 (edge)', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(500)
      res.end()
    })
    await new Promise<void>(resolve => server.listen(0, resolve))
    const port = (server.address() as { port: number }).port
    try {
      expect(await isDaemonAlive(port)).toBe(false)
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
