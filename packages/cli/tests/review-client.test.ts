// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { type DaemonInstance, startDaemon } from '../src/review/daemon.js'
import { awaitVerdict, enqueuePlan } from '../src/review/client.js'

const SHELL = '<!doctype html><title>shell</title>'

async function fakeDaemon(idleMs = 60_000): Promise<DaemonInstance> {
  return startDaemon({ port: 0, idleMs, getShellHtml: async () => SHELL })
}

describe('enqueuePlan', () => {
  let d: DaemonInstance
  afterEach(async () => {
    await d?.close()
  })

  it('enqueues and returns the assigned id and shellConnected (golden)', async () => {
    d = await fakeDaemon()
    const res = await enqueuePlan(d.port, { source: '# T\n\nx\n', dir: 'proj' })
    expect(res.id).toBe('p1')
    expect(res.shellConnected).toBe(false)
  }, 60_000)

  it('rejects when the daemon refuses the body (error)', async () => {
    d = await fakeDaemon()
    // The daemon requires a string `source`; passing none yields a 400 the client must surface as a
    // rejection rather than silently returning a bad value.
    await expect(
      enqueuePlan(d.port, { dir: 'proj' } as { source: string; dir: string }),
    ).rejects.toThrow()
  }, 60_000)
})

describe('awaitVerdict', () => {
  let d: DaemonInstance
  afterEach(async () => {
    await d?.close()
  })

  it('resolves with the Feedback once the plan settles (golden)', async () => {
    d = await fakeDaemon()
    const { id } = await enqueuePlan(d.port, { source: '# T\n\nx\n', dir: 'proj' })
    const verdictP = awaitVerdict(d.port, id)
    await new Promise(r => setTimeout(r, 50))
    await fetch(`http://localhost:${d.port}/__vp_feedback`, {
      method: 'POST',
      body: JSON.stringify({ decision: 'approve', planId: id }),
    })
    await expect(verdictP).resolves.toMatchObject({ decision: 'approve' })
  }, 60_000)

  it('rejects for an unknown plan id (error)', async () => {
    d = await fakeDaemon()
    await expect(awaitVerdict(d.port, 'ghost')).rejects.toThrow()
  }, 60_000)

  it('rejects and aborts the request when the signal fires (edge)', async () => {
    d = await fakeDaemon()
    const { id } = await enqueuePlan(d.port, { source: '# T\n\nx\n', dir: 'proj' })
    const controller = new AbortController()
    const verdictP = awaitVerdict(d.port, id, controller.signal)
    await new Promise(r => setTimeout(r, 50))
    controller.abort()
    await expect(verdictP).rejects.toThrow()
  }, 60_000)
})
