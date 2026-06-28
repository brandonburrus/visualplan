// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { type DaemonInstance, startDaemon } from '../src/review/daemon.js'

const SHELL = '<!doctype html><title>shell</title>'
const PLAN = '# My Plan\n\nbody text\n'

/** A daemon with a fake shell (no slow Vite build) and a fast idle TTL for tests. */
async function fakeDaemon(
  overrides: Partial<Parameters<typeof startDaemon>[0]> = {},
): Promise<DaemonInstance> {
  return startDaemon({
    port: 0,
    idleMs: 200,
    getShellHtml: async () => SHELL,
    ...overrides,
  })
}

function url(d: DaemonInstance, path: string): string {
  return `http://localhost:${d.port}${path}`
}

/** Enqueue a tiny plan; the real buildHtml runs, so callers allow a generous timeout. */
async function enqueue(
  d: DaemonInstance,
  body: Record<string, unknown> = {},
): Promise<{ id: string; shellConnected: boolean }> {
  const res = await fetch(url(d, '/__vp_enqueue'), {
    method: 'POST',
    body: JSON.stringify({ source: PLAN, dir: 'proj', ...body }),
  })
  expect(res.status).toBe(200)
  return res.json() as Promise<{ id: string; shellConnected: boolean }>
}

/** Read one SSE `event: queue` frame's parsed data from a held events connection. */
async function firstQueueEvent(d: DaemonInstance, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url(d, '/__vp_events'), {
    signal,
    headers: { accept: 'text/event-stream' },
  })
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) throw new Error('events stream ended before a frame')
    buffer += decoder.decode(value, { stream: true })
    const frame = buffer.match(/event: queue\ndata: (.*)\n\n/)
    if (frame) return JSON.parse(frame[1])
  }
}

describe('daemon liveness and shell', () => {
  let d: DaemonInstance
  afterEach(async () => {
    await d?.close()
  })

  it('answers /__vp_ping with 200 ok (golden)', async () => {
    d = await fakeDaemon()
    const res = await fetch(url(d, '/__vp_ping'))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  })

  it('serves the shell html at / (golden)', async () => {
    d = await fakeDaemon()
    const res = await fetch(url(d, '/'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toBe(SHELL)
  })

  it('404s an unknown plan id (error)', async () => {
    d = await fakeDaemon()
    const res = await fetch(url(d, '/plan/nope'))
    expect(res.status).toBe(404)
  })
})

describe('daemon enqueue', () => {
  let d: DaemonInstance
  afterEach(async () => {
    await d?.close()
  })

  it('enqueues a plan, assigns an id, and serves its html (golden)', async () => {
    d = await fakeDaemon()
    const { id } = await enqueue(d)
    expect(id).toBe('p1')
    const res = await fetch(url(d, `/plan/${id}`))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect((await res.text()).length).toBeGreaterThan(0)
  }, 60_000)

  it('extracts the title from the first # heading into the queue entry (golden)', async () => {
    d = await fakeDaemon()
    const controller = new AbortController()
    const eventP = firstQueueEvent(d, controller.signal)
    await new Promise(r => setTimeout(r, 50))
    await enqueue(d)
    // The queue event after enqueue carries the extracted title.
    let queue = (await eventP) as Array<{ title: string }>
    if (queue.length === 0) {
      // The connect frame may arrive empty before enqueue; read the next.
      queue = (await firstQueueEvent(d, controller.signal)) as Array<{ title: string }>
    }
    controller.abort()
    expect(queue[0]?.title).toBe('My Plan')
  }, 60_000)

  it('reports shellConnected=true when an events client is connected (edge)', async () => {
    // Generous idleMs so the start-empty idle timer cannot fire during the build below.
    d = await fakeDaemon({ idleMs: 60_000 })
    const controller = new AbortController()
    // Await the first SSE frame so the connection is provably registered before enqueuing (a fixed
    // sleep is racy under load): the daemon writes the connect frame synchronously on accept.
    await firstQueueEvent(d, controller.signal)
    const { shellConnected } = await enqueue(d)
    controller.abort()
    expect(shellConnected).toBe(true)
  }, 60_000)

  it('rejects an unparseable body with 400 (error)', async () => {
    d = await fakeDaemon()
    const res = await fetch(url(d, '/__vp_enqueue'), { method: 'POST', body: '{ not json' })
    expect(res.status).toBe(400)
  })
})

describe('daemon enqueue -> verdict roundtrip', () => {
  let d: DaemonInstance
  afterEach(async () => {
    await d?.close()
  })

  it('routes a /__vp_feedback POST to the waiting verdict by planId (golden)', async () => {
    d = await fakeDaemon()
    const { id } = await enqueue(d)
    const verdictP = fetch(url(d, `/__vp_verdict?id=${id}`)).then(r => r.json())
    await new Promise(r => setTimeout(r, 50))
    const res = await fetch(url(d, '/__vp_feedback'), {
      method: 'POST',
      body: JSON.stringify({ decision: 'approve', planId: id }),
    })
    expect(res.status).toBe(200)
    await expect(verdictP).resolves.toMatchObject({ decision: 'approve' })
  }, 60_000)

  it('routes feedback to the correct plan when two are queued (edge)', async () => {
    d = await fakeDaemon()
    const a = await enqueue(d, { source: '# A\n\nx\n' })
    const b = await enqueue(d, { source: '# B\n\ny\n' })
    const verdictA = fetch(url(d, `/__vp_verdict?id=${a.id}`)).then(r => r.json())
    const verdictB = fetch(url(d, `/__vp_verdict?id=${b.id}`)).then(r => r.json())
    await new Promise(r => setTimeout(r, 50))
    await fetch(url(d, '/__vp_feedback'), {
      method: 'POST',
      body: JSON.stringify({
        decision: 'iterate',
        planId: b.id,
        comments: [{ section: 'B', body: 'fix' }],
      }),
    })
    await fetch(url(d, '/__vp_feedback'), {
      method: 'POST',
      body: JSON.stringify({ decision: 'approve', planId: a.id }),
    })
    await expect(verdictA).resolves.toMatchObject({ decision: 'approve' })
    await expect(verdictB).resolves.toMatchObject({ decision: 'iterate' })
  }, 60_000)

  it('404s a verdict for an unknown id (error)', async () => {
    d = await fakeDaemon()
    const res = await fetch(url(d, '/__vp_verdict?id=ghost'))
    expect(res.status).toBe(404)
  }, 60_000)

  it('404s feedback for an unknown planId (error)', async () => {
    d = await fakeDaemon()
    const res = await fetch(url(d, '/__vp_feedback'), {
      method: 'POST',
      body: JSON.stringify({ decision: 'approve', planId: 'ghost' }),
    })
    expect(res.status).toBe(404)
  }, 60_000)

  it('400s an invalid feedback body (error)', async () => {
    d = await fakeDaemon()
    const { id } = await enqueue(d)
    const res = await fetch(url(d, '/__vp_feedback'), {
      method: 'POST',
      body: JSON.stringify({ decision: 'nope', planId: id }),
    })
    expect(res.status).toBe(400)
  }, 60_000)

  it('returns the actual decision (not the deny draft) when the plan is already settled (edge)', async () => {
    d = await fakeDaemon({ idleMs: 60_000 })
    const { id } = await enqueue(d)
    await fetch(url(d, '/__vp_feedback'), {
      method: 'POST',
      body: JSON.stringify({ decision: 'approve', planId: id }),
    })
    // A verdict requested after settling must reflect the recorded approve, not the deny-on-close draft.
    const late = await fetch(url(d, `/__vp_verdict?id=${id}`)).then(r => r.json())
    expect(late).toMatchObject({ decision: 'approve' })
  }, 60_000)

  it('treats a second feedback for a settled plan as an idempotent 200 (edge)', async () => {
    d = await fakeDaemon({ idleMs: 60_000 })
    const { id } = await enqueue(d)
    const first = await fetch(url(d, '/__vp_feedback'), {
      method: 'POST',
      body: JSON.stringify({ decision: 'approve', planId: id }),
    })
    expect(first.status).toBe(200)
    const second = await fetch(url(d, '/__vp_feedback'), {
      method: 'POST',
      body: JSON.stringify({ decision: 'deny', planId: id }),
    })
    expect(second.status).toBe(200)
  }, 60_000)
})

describe('daemon caller-disconnect', () => {
  let d: DaemonInstance
  afterEach(async () => {
    await d?.close()
  })

  it('drops the plan from the queue when the verdict caller disconnects (golden)', async () => {
    d = await fakeDaemon()
    const { id } = await enqueue(d)
    const controller = new AbortController()
    void fetch(url(d, `/__vp_verdict?id=${id}`), { signal: controller.signal }).catch(() => {})
    await new Promise(r => setTimeout(r, 100))
    controller.abort()
    await new Promise(r => setTimeout(r, 100))
    // The dropped plan is gone: its html 404s now.
    const res = await fetch(url(d, `/plan/${id}`))
    expect(res.status).toBe(404)
  }, 60_000)
})

describe('daemon draft', () => {
  let d: DaemonInstance
  afterEach(async () => {
    await d?.close()
  })

  it('accepts a valid draft for a known plan (golden)', async () => {
    d = await fakeDaemon()
    const { id } = await enqueue(d)
    const res = await fetch(url(d, '/__vp_draft'), {
      method: 'POST',
      body: JSON.stringify({
        decision: 'deny',
        planId: id,
        comments: [{ section: 'X', body: 'wip' }],
      }),
    })
    expect(res.status).toBe(200)
  }, 60_000)

  it('404s a draft for an unknown plan (error)', async () => {
    d = await fakeDaemon()
    const res = await fetch(url(d, '/__vp_draft'), {
      method: 'POST',
      body: JSON.stringify({ decision: 'deny', planId: 'ghost' }),
    })
    expect(res.status).toBe(404)
  }, 60_000)

  it('400s an invalid draft body (error)', async () => {
    d = await fakeDaemon()
    const { id } = await enqueue(d)
    const res = await fetch(url(d, '/__vp_draft'), {
      method: 'POST',
      body: JSON.stringify({ decision: 'nope', planId: id }),
    })
    expect(res.status).toBe(400)
  }, 60_000)
})

describe('daemon idle TTL', () => {
  it('shuts down after idleMs with an empty queue and calls onIdle (golden)', async () => {
    let idled = false
    const d = await fakeDaemon({ idleMs: 200, onIdle: () => (idled = true) })
    // Queue never had a pending entry; the idle timer should fire from start-empty.
    await new Promise(r => setTimeout(r, 400))
    expect(idled).toBe(true)
    // The server is closed: the port is dead.
    await expect(
      fetch(url(d, '/__vp_ping')).then(
        () => 'up',
        () => 'down',
      ),
    ).resolves.toBe('down')
  }, 60_000)

  it('is cancelled by a new enqueue, keeping the daemon alive (edge)', async () => {
    let idled = false
    const d = await fakeDaemon({ idleMs: 300, onIdle: () => (idled = true) })
    await new Promise(r => setTimeout(r, 100))
    await enqueue(d)
    await new Promise(r => setTimeout(r, 300))
    // The enqueue cancelled the start-empty idle timer; with a pending plan it must not have idled.
    expect(idled).toBe(false)
    expect((await fetch(url(d, '/__vp_ping'))).status).toBe(200)
    await d.close()
  }, 60_000)
})

describe('daemon shell-close deny-all', () => {
  it('denies still-pending plans when the last events client closes past the grace (golden)', async () => {
    const d = await fakeDaemon({ idleMs: 60_000 })
    const { id } = await enqueue(d)
    // A caller awaits the verdict; it should resolve to the deny when the shell closes.
    const verdictP = fetch(url(d, `/__vp_verdict?id=${id}`)).then(r => r.json())
    // Open and then close the events (shell) connection.
    const controller = new AbortController()
    void fetch(url(d, '/__vp_events'), { signal: controller.signal }).catch(() => {})
    await new Promise(r => setTimeout(r, 100))
    controller.abort()
    // Past the 1500ms grace, the pending plan is denied with its default draft.
    await expect(verdictP).resolves.toMatchObject({ decision: 'deny' })
  }, 60_000)

  it('survives a brief events reconnect within the grace without denying (edge)', async () => {
    const d = await fakeDaemon({ idleMs: 60_000 })
    const { id } = await enqueue(d)
    const c1 = new AbortController()
    void fetch(url(d, '/__vp_events'), { signal: c1.signal }).catch(() => {})
    await new Promise(r => setTimeout(r, 100))
    c1.abort()
    // Reconnect well within the 1500ms grace window.
    await new Promise(r => setTimeout(r, 200))
    const c2 = new AbortController()
    void fetch(url(d, '/__vp_events'), { signal: c2.signal }).catch(() => {})
    // Wait past when the grace would have fired had it not been cancelled.
    await new Promise(r => setTimeout(r, 1600))
    // The plan must still be live (not denied): its html still serves.
    const res = await fetch(url(d, `/plan/${id}`))
    expect(res.status).toBe(200)
    c2.abort()
    await d.close()
  }, 60_000)
})

describe('daemon queue entries: version, decision, requeue dedupe', () => {
  let d: DaemonInstance
  afterEach(async () => {
    await d?.close()
  })

  it('carries the iteration onto the queued entry (golden)', async () => {
    d = await fakeDaemon()
    await enqueue(d, { iteration: 3, key: '/p/a.mdx' })
    const ctrl = new AbortController()
    const queue = (await firstQueueEvent(d, ctrl.signal)) as Array<{ iteration?: number }>
    ctrl.abort()
    expect(queue).toHaveLength(1)
    expect(queue[0].iteration).toBe(3)
  }, 60_000)

  it('records the locked-in decision on the entry once settled (golden)', async () => {
    d = await fakeDaemon()
    const { id } = await enqueue(d)
    await fetch(url(d, '/__vp_feedback'), {
      method: 'POST',
      body: JSON.stringify({ decision: 'deny', planId: id }),
    })
    const ctrl = new AbortController()
    const queue = (await firstQueueEvent(d, ctrl.signal)) as Array<{
      status: string
      decision?: string
    }>
    ctrl.abort()
    expect(queue[0].status).toBe('done')
    expect(queue[0].decision).toBe('deny')
  }, 60_000)

  it('replaces the prior version when requeued with the same key (golden)', async () => {
    d = await fakeDaemon()
    const first = await enqueue(d, { key: '/p/a.mdx', iteration: 1 })
    const second = await enqueue(d, { key: '/p/a.mdx', iteration: 2 })
    const ctrl = new AbortController()
    const queue = (await firstQueueEvent(d, ctrl.signal)) as Array<{
      id: string
      iteration?: number
    }>
    ctrl.abort()
    expect(queue).toHaveLength(1)
    expect(queue[0].id).toBe(second.id)
    expect(queue[0].id).not.toBe(first.id)
    expect(queue[0].iteration).toBe(2)
  }, 60_000)

  it('keeps plans with distinct keys as separate entries (edge)', async () => {
    d = await fakeDaemon()
    await enqueue(d, { key: '/p/a.mdx' })
    await enqueue(d, { key: '/p/b.mdx' })
    const ctrl = new AbortController()
    const queue = (await firstQueueEvent(d, ctrl.signal)) as unknown[]
    ctrl.abort()
    expect(queue).toHaveLength(2)
  }, 60_000)

  it('unblocks a caller still waiting on the superseded version with a deny (edge)', async () => {
    d = await fakeDaemon()
    const first = await enqueue(d, { key: '/p/a.mdx' })
    const verdict = fetch(url(d, `/__vp_verdict?id=${first.id}`)).then(
      r => r.json() as Promise<{ decision: string }>,
    )
    await new Promise(resolve => setTimeout(resolve, 50))
    await enqueue(d, { key: '/p/a.mdx' })
    expect((await verdict).decision).toBe('deny')
  }, 60_000)
})
