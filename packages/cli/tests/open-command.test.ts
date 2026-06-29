// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { type OpenDeps, runOpen } from '../src/commands/open.js'

/** A deps double that records the daemon idleMs, the opened URL, and stdout writes. */
function fakeDeps(port = 9151): {
  deps: OpenDeps
  calls: { idleMs?: number; opened: string[]; out: string[] }
} {
  const calls = {
    idleMs: undefined as number | undefined,
    opened: [] as string[],
    out: [] as string[],
  }
  const deps: OpenDeps = {
    ensureDaemon: async idleMs => {
      calls.idleMs = idleMs
      return { port }
    },
    openBrowser: async url => {
      calls.opened.push(url)
    },
    stdout: {
      write: (chunk: string | Uint8Array) => calls.out.push(String(chunk)),
    } as unknown as NodeJS.WriteStream,
  }
  return { deps, calls }
}

describe('runOpen', () => {
  it('starts/reuses the daemon and opens its queue URL (golden)', async () => {
    const { deps, calls } = fakeDeps(9151)
    await runOpen({}, deps)
    expect(calls.opened).toEqual(['http://localhost:9151/'])
    expect(calls.out.join('')).toContain('http://localhost:9151/')
  })

  it('passes the configured daemon idle TTL through to ensureDaemon (golden)', async () => {
    const { deps, calls } = fakeDeps()
    await runOpen({}, deps)
    // readConfig supplies daemonTimeout (default 15m when unset); it must be a positive ms value.
    expect(typeof calls.idleMs).toBe('number')
    expect(calls.idleMs).toBeGreaterThan(0)
  })

  it('prints the URL but does not open a browser with --no-open (edge)', async () => {
    const { deps, calls } = fakeDeps(9152)
    await runOpen({ open: false }, deps)
    expect(calls.opened).toEqual([])
    expect(calls.out.join('')).toContain('http://localhost:9152/')
  })

  it('rejects when the daemon cannot be started (error)', async () => {
    const deps: OpenDeps = {
      ensureDaemon: async () => {
        throw new Error('daemon did not come alive')
      },
      openBrowser: async () => {},
      stdout: { write: () => true } as unknown as NodeJS.WriteStream,
    }
    await expect(runOpen({}, deps)).rejects.toThrow(/daemon did not come alive/)
  })
})
