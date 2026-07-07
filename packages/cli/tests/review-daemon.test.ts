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

/** Read the raw /__vp_events stream until `predicate` matches the buffer or `timeoutMs` elapses;
 * returns the buffered text either way. */
async function readEventsUntil(
  d: DaemonInstance,
  signal: AbortSignal,
  predicate: (buffer: string) => boolean,
  timeoutMs: number,
): Promise<string> {
  const res = await fetch(url(d, '/__vp_events'), {
    signal,
    headers: { accept: 'text/event-stream' },
  })
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline && !predicate(buffer)) {
    const next = await Promise.race([
      reader.read(),
      new Promise<'timeout'>(r => setTimeout(() => r('timeout'), deadline - Date.now())),
    ])
    if (next === 'timeout' || next.done) break
    buffer += decoder.decode(next.value, { stream: true })
  }
  return buffer
}

describe('daemon SSE heartbeat', () => {
  let d: DaemonInstance
  afterEach(async () => {
    await d?.close()
  })

  it('writes ": hb" comment frames to held events clients between queue frames (golden)', async () => {
    d = await fakeDaemon({ idleMs: 60_000, heartbeatMs: 50 })
    const ctrl = new AbortController()
    const buffer = await readEventsUntil(d, ctrl.signal, b => b.includes(': hb\n\n'), 2_000)
    ctrl.abort()
    expect(buffer).toContain(': hb\n\n')
  }, 60_000)
})

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

describe('daemon two-tier close grace', () => {
  it('denies pending plans about reloadGraceMs after a close beacon plus last-close (golden)', async () => {
    const d = await fakeDaemon({ idleMs: 60_000, reloadGraceMs: 200 })
    const { id } = await enqueue(d)
    // The reviewer left a partial draft; the beacon-evidenced close must deliver it.
    await fetch(url(d, '/__vp_draft'), {
      method: 'POST',
      body: JSON.stringify({
        decision: 'deny',
        planId: id,
        comments: [{ section: 'X', body: 'partial' }],
      }),
    })
    const verdictP = fetch(url(d, `/__vp_verdict?id=${id}`)).then(
      r => r.json() as Promise<{ decision: string; comments: Array<{ body: string }> }>,
    )
    const ctrl = new AbortController()
    void fetch(url(d, '/__vp_events'), { signal: ctrl.signal }).catch(() => {})
    await new Promise(r => setTimeout(r, 100))
    // The page unloads: beacon first, then the socket drops.
    const beacon = await fetch(url(d, '/__vp_shell_closed'), { method: 'POST' })
    expect(beacon.status).toBe(204)
    ctrl.abort()
    const start = Date.now()
    const resolved = await verdictP
    expect(resolved.decision).toBe('deny')
    expect(resolved.comments).toMatchObject([{ body: 'partial' }])
    // Fast tier: about reloadGraceMs, nowhere near idleMs.
    expect(Date.now() - start).toBeLessThan(2_000)
  }, 60_000)

  it('holds a beaconless (silent) last-close for idleMs, surviving several reload windows (golden)', async () => {
    let denied = false
    const d = await fakeDaemon({ idleMs: 400, reloadGraceMs: 100 })
    const { id } = await enqueue(d)
    const verdictP = fetch(url(d, `/__vp_verdict?id=${id}`))
      .then(r => r.json() as Promise<{ decision: string }>)
      .then(v => {
        denied = true
        return v
      })
    const ctrl = new AbortController()
    void fetch(url(d, '/__vp_events'), { signal: ctrl.signal }).catch(() => {})
    await new Promise(r => setTimeout(r, 100))
    // Socket drops with no beacon: suspension/sleep/crash. Several reload windows pass undenyed.
    ctrl.abort()
    await new Promise(r => setTimeout(r, 300))
    expect(denied).toBe(false)
    // The silent tier expires at idleMs and denies.
    await expect(verdictP).resolves.toMatchObject({ decision: 'deny' })
  }, 60_000)
})

describe('daemon grace edge cases', () => {
  it('reschedules a silent grace to the reload tier when a late beacon arrives (edge)', async () => {
    const d = await fakeDaemon({ idleMs: 60_000, reloadGraceMs: 200 })
    const { id } = await enqueue(d)
    const verdictP = fetch(url(d, `/__vp_verdict?id=${id}`)).then(
      r => r.json() as Promise<{ decision: string }>,
    )
    const ctrl = new AbortController()
    void fetch(url(d, '/__vp_events'), { signal: ctrl.signal }).catch(() => {})
    await new Promise(r => setTimeout(r, 100))
    // Silent drop first (no beacon): the long grace arms.
    ctrl.abort()
    await new Promise(r => setTimeout(r, 300))
    // The delayed unload beacon finally lands: the drop WAS a real unload; tighten to reload grace.
    await fetch(url(d, '/__vp_shell_closed'), { method: 'POST' })
    const start = Date.now()
    await expect(verdictP).resolves.toMatchObject({ decision: 'deny' })
    expect(Date.now() - start).toBeLessThan(2_000)
  }, 60_000)

  it('cancels a silent grace when a client reconnects; the plan survives (edge)', async () => {
    const d = await fakeDaemon({ idleMs: 500, reloadGraceMs: 100 })
    const { id } = await enqueue(d)
    const c1 = new AbortController()
    void fetch(url(d, '/__vp_events'), { signal: c1.signal }).catch(() => {})
    await new Promise(r => setTimeout(r, 100))
    // Silent drop (suspension), then the tab resumes and EventSource reconnects mid-grace.
    c1.abort()
    await new Promise(r => setTimeout(r, 200))
    const c2 = new AbortController()
    void fetch(url(d, '/__vp_events'), { signal: c2.signal }).catch(() => {})
    // Wait past when the silent grace would have fired had it not been cancelled.
    await new Promise(r => setTimeout(r, 600))
    const res = await fetch(url(d, `/plan/${id}`))
    expect(res.status).toBe(200)
    c2.abort()
    await d.close()
  }, 60_000)

  it('denies nothing when one of two shells closes, beacon or not (edge)', async () => {
    const d = await fakeDaemon({ idleMs: 60_000, reloadGraceMs: 100 })
    const { id } = await enqueue(d)
    const c1 = new AbortController()
    const c2 = new AbortController()
    void fetch(url(d, '/__vp_events'), { signal: c1.signal }).catch(() => {})
    void fetch(url(d, '/__vp_events'), { signal: c2.signal }).catch(() => {})
    await new Promise(r => setTimeout(r, 100))
    // One duplicate tab closes (with its unload beacon); a shell remains, so no grace arms.
    await fetch(url(d, '/__vp_shell_closed'), { method: 'POST' })
    c1.abort()
    await new Promise(r => setTimeout(r, 400))
    const res = await fetch(url(d, `/plan/${id}`))
    expect(res.status).toBe(200)
    c2.abort()
    await d.close()
  }, 60_000)

  it('answers the close beacon 204 and stays fully up while a shell is connected (edge)', async () => {
    const d = await fakeDaemon({ idleMs: 60_000, reloadGraceMs: 100 })
    const { id } = await enqueue(d)
    const ctrl = new AbortController()
    void fetch(url(d, '/__vp_events'), { signal: ctrl.signal }).catch(() => {})
    await new Promise(r => setTimeout(r, 100))
    // A beacon with no socket drop (e.g. a cancelled navigation) must be a harmless no-op.
    const res = await fetch(url(d, '/__vp_shell_closed'), { method: 'POST' })
    expect(res.status).toBe(204)
    await new Promise(r => setTimeout(r, 400))
    expect((await fetch(url(d, `/plan/${id}`))).status).toBe(200)
    expect((await fetch(url(d, '/__vp_ping'))).status).toBe(200)
    ctrl.abort()
    await d.close()
  }, 60_000)
})

describe('daemon shutdown onIdle ordering', () => {
  it('awaits an async onIdle before close() resolves (golden)', async () => {
    let cleaned = false
    const d = await fakeDaemon({
      idleMs: 60_000,
      onIdle: async () => {
        await new Promise(r => setTimeout(r, 100))
        cleaned = true
      },
    })
    await d.close()
    // Lock removal and other cleanup must have completed by the time close() resolves.
    expect(cleaned).toBe(true)
  }, 60_000)
})

describe('daemon shell-close deny-all', () => {
  it('denies still-pending plans when the last events client closes past the grace (golden)', async () => {
    const d = await fakeDaemon({ idleMs: 60_000, reloadGraceMs: 200 })
    const { id } = await enqueue(d)
    // A caller awaits the verdict; it should resolve to the deny when the shell closes.
    const verdictP = fetch(url(d, `/__vp_verdict?id=${id}`)).then(r => r.json())
    // Open and then close the events (shell) connection, with the unload beacon a real close sends.
    const controller = new AbortController()
    void fetch(url(d, '/__vp_events'), { signal: controller.signal }).catch(() => {})
    await new Promise(r => setTimeout(r, 100))
    await fetch(url(d, '/__vp_shell_closed'), { method: 'POST' })
    controller.abort()
    // Past the reload grace, the pending plan is denied with its default draft.
    await expect(verdictP).resolves.toMatchObject({ decision: 'deny' })
  }, 60_000)

  it('survives a brief events reconnect within the grace without denying (edge)', async () => {
    const d = await fakeDaemon({ idleMs: 60_000, reloadGraceMs: 300 })
    const { id } = await enqueue(d)
    const c1 = new AbortController()
    void fetch(url(d, '/__vp_events'), { signal: c1.signal }).catch(() => {})
    await new Promise(r => setTimeout(r, 100))
    // A reload: unload beacon, socket drop, then the fresh page reconnects within the grace.
    await fetch(url(d, '/__vp_shell_closed'), { method: 'POST' })
    c1.abort()
    await new Promise(r => setTimeout(r, 100))
    const c2 = new AbortController()
    void fetch(url(d, '/__vp_events'), { signal: c2.signal }).catch(() => {})
    // Wait past when the grace would have fired had it not been cancelled.
    await new Promise(r => setTimeout(r, 500))
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

  it('updates the entry in place when requeued with the same key, keeping the id (golden)', async () => {
    d = await fakeDaemon()
    const first = await enqueue(d, { key: '/p/a.mdx', iteration: 1 })
    const second = await enqueue(d, {
      key: '/p/a.mdx',
      iteration: 2,
      source: '# Revised Plan\n\nbody v2\n',
    })
    expect(second.id).toBe(first.id)
    const ctrl = new AbortController()
    const queue = (await firstQueueEvent(d, ctrl.signal)) as Array<{
      id: string
      title: string
      status: string
      iteration?: number
      decision?: string
      rev: number
    }>
    ctrl.abort()
    expect(queue).toHaveLength(1)
    expect(queue[0].id).toBe(first.id)
    expect(queue[0].rev).toBe(2)
    expect(queue[0].status).toBe('pending')
    expect(queue[0].decision).toBeUndefined()
    expect(queue[0].title).toBe('Revised Plan')
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

  it('unblocks a caller still waiting on the superseded version with its draft (edge)', async () => {
    d = await fakeDaemon()
    const first = await enqueue(d, { key: '/p/a.mdx' })
    const verdict = fetch(url(d, `/__vp_verdict?id=${first.id}`)).then(
      r => r.json() as Promise<{ decision: string; comments: Array<{ body: string }> }>,
    )
    await new Promise(resolve => setTimeout(resolve, 50))
    // The reviewer left a partial draft on the old revision; superseding must deliver it, not an
    // empty default deny.
    await fetch(url(d, '/__vp_draft'), {
      method: 'POST',
      body: JSON.stringify({
        decision: 'deny',
        planId: first.id,
        comments: [{ section: 'X', body: 'wip note' }],
      }),
    })
    await enqueue(d, { key: '/p/a.mdx' })
    const resolved = await verdict
    expect(resolved.decision).toBe('deny')
    expect(resolved.comments).toMatchObject([{ body: 'wip note' }])
  }, 60_000)

  it('resets an approved (done) plan in place on a same-key re-enqueue (edge)', async () => {
    d = await fakeDaemon({ idleMs: 60_000 })
    const first = await enqueue(d, { key: '/p/a.mdx' })
    await fetch(url(d, '/__vp_feedback'), {
      method: 'POST',
      body: JSON.stringify({ decision: 'approve', planId: first.id }),
    })
    const second = await enqueue(d, { key: '/p/a.mdx' })
    expect(second.id).toBe(first.id)
    const ctrl = new AbortController()
    const queue = (await firstQueueEvent(d, ctrl.signal)) as Array<{
      id: string
      status: string
      decision?: string
      rev: number
    }>
    ctrl.abort()
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({ id: first.id, status: 'pending', rev: 2 })
    expect(queue[0].decision).toBeUndefined()
  }, 120_000)
})

describe('daemon iterate-in-place', () => {
  let d: DaemonInstance
  afterEach(async () => {
    await d?.close()
  })

  it('marks an iterate verdict as status iterating and resolves the waiter (golden)', async () => {
    d = await fakeDaemon({ idleMs: 60_000 })
    const { id } = await enqueue(d, { key: '/p/a.mdx' })
    const verdictP = fetch(url(d, `/__vp_verdict?id=${id}`)).then(r => r.json())
    await new Promise(r => setTimeout(r, 50))
    await fetch(url(d, '/__vp_feedback'), {
      method: 'POST',
      body: JSON.stringify({ decision: 'iterate', planId: id }),
    })
    await expect(verdictP).resolves.toMatchObject({ decision: 'iterate' })
    const ctrl = new AbortController()
    const queue = (await firstQueueEvent(d, ctrl.signal)) as Array<{
      status: string
      decision?: string
    }>
    ctrl.abort()
    expect(queue[0].status).toBe('iterating')
    expect(queue[0].decision).toBe('iterate')
  }, 60_000)
})

describe('daemon iterate -> re-enqueue -> verdict rebind', () => {
  let d: DaemonInstance
  afterEach(async () => {
    await d?.close()
  })

  it('long-polls a new verdict after a same-key re-enqueue instead of replaying the stale iterate (golden)', async () => {
    d = await fakeDaemon({ idleMs: 60_000 })
    const { id } = await enqueue(d, { key: '/p/a.mdx' })
    await fetch(url(d, '/__vp_feedback'), {
      method: 'POST',
      body: JSON.stringify({ decision: 'iterate', planId: id }),
    })
    const second = await enqueue(d, { key: '/p/a.mdx' })
    expect(second.id).toBe(id)
    // The revised plan's caller awaits a fresh verdict on the same id: it must hang (the entry was
    // reset to pending), not be answered instantly with the settled iterate feedback.
    let resolvedEarly = false
    const verdictP = fetch(url(d, `/__vp_verdict?id=${id}`))
      .then(r => r.json() as Promise<{ decision: string }>)
      .then(v => {
        resolvedEarly = true
        return v
      })
    await new Promise(r => setTimeout(r, 300))
    expect(resolvedEarly).toBe(false)
    await fetch(url(d, '/__vp_feedback'), {
      method: 'POST',
      body: JSON.stringify({ decision: 'approve', planId: id }),
    })
    await expect(verdictP).resolves.toMatchObject({ decision: 'approve' })
  }, 60_000)
})

describe('daemon auto-increment iteration', () => {
  let d: DaemonInstance
  afterEach(async () => {
    await d?.close()
  })

  /** Read the single queue entry's iteration from a fresh events connection. */
  async function queuedIteration(): Promise<number | undefined> {
    const ctrl = new AbortController()
    const queue = (await firstQueueEvent(d, ctrl.signal)) as Array<{ iteration?: number }>
    ctrl.abort()
    return queue[0]?.iteration
  }

  it('bumps the iteration to old+1 on a same-key re-enqueue without an explicit one (golden)', async () => {
    d = await fakeDaemon({ idleMs: 60_000 })
    await enqueue(d, { key: '/p/a.mdx', iteration: 3 })
    await enqueue(d, { key: '/p/a.mdx' })
    expect(await queuedIteration()).toBe(4)
  }, 60_000)

  it('treats a missing old iteration as 1, bumping to 2 (edge)', async () => {
    d = await fakeDaemon({ idleMs: 60_000 })
    await enqueue(d, { key: '/p/a.mdx' })
    await enqueue(d, { key: '/p/a.mdx' })
    expect(await queuedIteration()).toBe(2)
  }, 60_000)

  it('lets an explicit iteration win over the auto-bump (edge)', async () => {
    d = await fakeDaemon({ idleMs: 60_000 })
    await enqueue(d, { key: '/p/a.mdx', iteration: 3 })
    await enqueue(d, { key: '/p/a.mdx', iteration: 7 })
    expect(await queuedIteration()).toBe(7)
  }, 60_000)

  it('keeps a fresh (non-update) enqueue iteration as given, possibly undefined (edge)', async () => {
    d = await fakeDaemon({ idleMs: 60_000 })
    await enqueue(d, { key: '/p/a.mdx' })
    expect(await queuedIteration()).toBeUndefined()
  }, 60_000)
})

describe('daemon /plan across revisions', () => {
  let d: DaemonInstance
  afterEach(async () => {
    await d?.close()
  })

  it('serves the swapped html with no-store and no stale decided-injection after a re-enqueue (golden)', async () => {
    d = await fakeDaemon({ idleMs: 60_000 })
    const { id } = await enqueue(d, { key: '/p/a.mdx' })
    await fetch(url(d, '/__vp_feedback'), {
      method: 'POST',
      body: JSON.stringify({ decision: 'iterate', planId: id }),
    })
    await enqueue(d, { key: '/p/a.mdx', source: '# Revised Plan\n\nbody v2\n' })
    const res = await fetch(url(d, `/plan/${id}`))
    expect(res.status).toBe(200)
    // The id is reused across revisions, so the browser must never serve a cached revision.
    expect(res.headers.get('cache-control')).toBe('no-store')
    const html = await res.text()
    expect(html).toContain('Revised Plan')
    // The reset entry is pending again: no locked-in verdict may be injected.
    expect(html).not.toContain('globalThis.__VP_REVIEW_DECIDED__=')
  }, 120_000)
})

describe('daemon entry timestamps', () => {
  let d: DaemonInstance
  afterEach(async () => {
    await d?.close()
  })

  /** Read the single queue entry's timestamps from a fresh events connection. */
  async function stamps(): Promise<{ createdAt?: number; updatedAt?: number }> {
    const ctrl = new AbortController()
    const queue = (await firstQueueEvent(d, ctrl.signal)) as Array<{
      createdAt?: number
      updatedAt?: number
    }>
    ctrl.abort()
    return queue[0]
  }

  it('stamps createdAt and updatedAt on enqueue, moving updatedAt on settle and re-enqueue (golden)', async () => {
    d = await fakeDaemon({ idleMs: 60_000 })
    const before = Date.now()
    const { id } = await enqueue(d, { key: '/p/a.mdx' })
    const fresh = await stamps()
    expect(fresh.createdAt).toBeGreaterThanOrEqual(before)
    expect(fresh.updatedAt).toBeGreaterThanOrEqual(before)
    await new Promise(r => setTimeout(r, 20))
    await fetch(url(d, '/__vp_feedback'), {
      method: 'POST',
      body: JSON.stringify({ decision: 'iterate', planId: id }),
    })
    const settled = await stamps()
    expect(settled.updatedAt!).toBeGreaterThan(fresh.updatedAt!)
    expect(settled.createdAt).toBe(fresh.createdAt)
    await new Promise(r => setTimeout(r, 20))
    await enqueue(d, { key: '/p/a.mdx' })
    const revised = await stamps()
    expect(revised.updatedAt!).toBeGreaterThan(settled.updatedAt!)
    expect(revised.createdAt).toBe(fresh.createdAt)
  }, 120_000)
})

describe('daemon idle TTL with iterating plans', () => {
  it('keeps the daemon alive past idleMs while a plan is iterating, idles after approve (golden)', async () => {
    let idled = false
    const d = await fakeDaemon({ idleMs: 300, onIdle: () => (idled = true) })
    const { id } = await enqueue(d, { key: '/p/a.mdx' })
    await fetch(url(d, '/__vp_feedback'), {
      method: 'POST',
      body: JSON.stringify({ decision: 'iterate', planId: id }),
    })
    // An iterating entry is a promise of an imminent re-enqueue; the idle TTL must not fire.
    await new Promise(r => setTimeout(r, 500))
    expect(idled).toBe(false)
    expect((await fetch(url(d, '/__vp_ping'))).status).toBe(200)
    // The revised plan arrives and is approved: nothing pending remains, idle fires.
    const second = await enqueue(d, { key: '/p/a.mdx' })
    await fetch(url(d, '/__vp_feedback'), {
      method: 'POST',
      body: JSON.stringify({ decision: 'approve', planId: second.id }),
    })
    await new Promise(r => setTimeout(r, 500))
    expect(idled).toBe(true)
  }, 60_000)
})

describe('daemon /plan decided-verdict injection', () => {
  let d: DaemonInstance
  afterEach(async () => {
    await d?.close()
  })

  it('injects the verdict into a re-served decided plan, not a pending one (golden)', async () => {
    d = await fakeDaemon()
    const { id } = await enqueue(d)
    // The bundled runtime *reads* the global, so the bare name appears either way; the injected
    // *assignment* is what marks a decided plan apart from a pending one.
    const assign = 'globalThis.__VP_REVIEW_DECIDED__="deny"'
    const pending = await (await fetch(url(d, `/plan/${id}`))).text()
    expect(pending).not.toContain(assign)
    await fetch(url(d, '/__vp_feedback'), {
      method: 'POST',
      body: JSON.stringify({
        decision: 'deny',
        planId: id,
        answers: [{ question: 'TTL ok?', answer: 'Yes' }],
      }),
    })
    const decided = await (await fetch(url(d, `/plan/${id}`))).text()
    expect(decided).toContain(assign)
    // The reviewer's answers ride along so a re-opened plan still shows them.
    expect(decided).toContain('__VP_REVIEW_ANSWERS__')
    expect(decided).toContain('TTL ok?')
  }, 60_000)
})
