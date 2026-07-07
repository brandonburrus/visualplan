/**
 * The Review Queue daemon: a single long-lived localhost HTTP server that holds an in-memory queue
 * of plans awaiting review and a browser "shell" page that lists them. A `vplan review`/`render
 * --review` invocation enqueues its plan here and waits (via `/__vp_verdict`) for the reviewer's
 * decision; the shell (held open over SSE on `/__vp_events`) renders the queue and embeds each
 * plan's page in an iframe served from `/plan/<id>`. Reusing one warm daemon across a planning
 * session is the whole point: the second plan of a session reuses the open tab instead of paying a
 * cold start.
 *
 * The HTTP/SSE contract here is FROZEN: the runtime shell page depends on the exact endpoints,
 * field names, and SSE frame shape. See the task's contract section before changing anything.
 * Additive extensions to that contract (all backward compatible):
 * - Queue entries carry `status: 'iterating'` (reviewer asked for iteration; the daemon holds the
 *   row awaiting the revision), `rev` (serving-generation counter), and `createdAt`/`updatedAt`.
 * - An enqueue whose `key` matches an existing plan UPDATES that entry in place and returns the
 *   SAME id (`rev` bumps, status resets to pending); ids are stable across revisions.
 * - `/plan/<id>` responses carry `cache-control: no-store` (ids are reused across revisions).
 * - `POST /__vp_shell_closed` (204): the shell's pagehide beacon, evidence of a real unload that
 *   selects the short close-grace tier; a silent socket drop gets the long (idleMs) tier instead.
 * - `/__vp_events` writes `: hb` SSE comment frames (invisible to EventSource) as a heartbeat.
 *
 * `startDaemon` is deliberately a plain `http.createServer` (not Vite) and is directly testable
 * in-process, like `startReviewServer`: no child process is required to exercise the routing.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { type Feedback, feedbackSchema, type QueueEntry } from '@visualplan/core'
import type { Theme } from '../config.js'
import { buildHtml } from '../build/compile.js'
import { buildQueueShell } from '../build/queue-shell.js'

export interface DaemonInstance {
  port: number
  close: () => Promise<void>
}

export interface StartDaemonOptions {
  /** Port to bind; 0 picks a free port (tests). */
  port: number
  /** Idle TTL: ms the daemon lingers after its queue has no pending plans before shutting down. */
  idleMs: number
  /** Builds the shell page served at `/`; defaults to the real `buildQueueShell`. Injectable so
   * tests avoid the slow Vite build. The result is cached after the first call. */
  getShellHtml?: () => Promise<string>
  /** SSE heartbeat interval; defaults to `HEARTBEAT_MS`. Injectable for tests, like `idleMs`. */
  heartbeatMs?: number
  /** Grace after the last shell closes WITH unload evidence (a close beacon); defaults to
   * `RELOAD_GRACE_MS`. Injectable for tests, like `idleMs`. */
  reloadGraceMs?: number
  /** Called once when the daemon shuts down (idle TTL or shell close), so the owner can clean up
   * its lock and exit the process. `shutdown()` awaits it, so lock removal completes before the
   * daemon reports closed. */
  onIdle?: () => void | Promise<void>
}

/** The default Deny resolved for a pending plan that is abandoned (tab/shell closed) with no draft. */
const DEFAULT_DENY: Feedback = { decision: 'deny', comments: [], answers: [] }

/** SSE heartbeat interval: comment frames (`: hb`, invisible to EventSource) written to every held
 * events client so a half-dead socket (suspended tab, laptop sleep) surfaces its `close` within
 * about one interval instead of lingering as a zombie, and so intermediaries do not idle-close the
 * stream. 25s stays comfortably under common 30-60s proxy idle timeouts. */
const HEARTBEAT_MS = 25_000

/** Grace after the last shell closes WITH unload evidence (a close beacon): a real reload has to
 * re-boot the whole shell JS, and 1.5s proved too tight for a heavy page; 5s still tears down
 * promptly on a genuine close. */
const RELOAD_GRACE_MS = 5_000

/** How close (ms) a close beacon must precede the socket drop to count as evidence of a real
 * unload. Beacons fire at `pagehide`, essentially simultaneous with the drop; 2s absorbs delivery
 * jitter without letting a stale beacon tag an unrelated later drop. */
const BEACON_ASSOC_MS = 2_000

/** Max request body size, mirroring compile.ts's cap so a malformed client cannot stream unbounded. */
const MAX_BODY_BYTES = 1_000_000

/** Read a request body to a string, capped so a malformed client cannot stream unbounded data. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => {
      raw += chunk
      if (raw.length > MAX_BODY_BYTES) reject(new Error('request body too large'))
    })
    req.on('end', () => resolve(raw))
    req.on('error', reject)
  })
}

/** The plan's title is its first `# ` heading line, trimmed; empty string if there is none. */
function titleFromSource(source: string): string {
  return source.replace(/^﻿/, '').match(/^# (.+?)\s*$/m)?.[1] ?? ''
}

/**
 * Inject the decided verdict and the reviewer's answers into a re-served plan page
 * (`__VP_REVIEW_DECIDED__`, `__VP_REVIEW_ANSWERS__`), so re-opening a plan the reviewer already
 * decided locks into the submitted state (no live controls) and still shows the answers they gave.
 * A plain head script runs before the deferred runtime module that reads the globals.
 */
function withDecided(html: string, feedback: Feedback): string {
  const tag =
    `<script>globalThis.__VP_REVIEW_DECIDED__=${JSON.stringify(feedback.decision)};` +
    `globalThis.__VP_REVIEW_ANSWERS__=${JSON.stringify(feedback.answers ?? [])}</script>`
  return html.includes('</head>') ? html.replace('</head>', `${tag}</head>`) : `${tag}${html}`
}

/** One queued plan's full server-side state. */
interface QueuedPlan {
  entry: QueueEntry
  /** A stable identity for the plan across iterations (the originating file path), so a requeued
   * version replaces its predecessor in the queue. Undefined for stdin (no stable key). */
  key?: string
  /** The plan's self-contained HTML, served from `/plan/<id>`. */
  html: string
  /** Resolvers of held `/__vp_verdict` connections waiting on this plan's decision. */
  waiters: Array<(feedback: Feedback) => void>
  /** The Deny-on-close payload kept current by `/__vp_draft`. */
  draft: Feedback
  /** The feedback this plan settled with, set once it settles; a verdict requested late returns it. */
  settledFeedback?: Feedback
  /** True once a decision (or deny) has settled this plan; further feedback is an idempotent no-op. */
  settled: boolean
}

interface EnqueueBody {
  source: string
  theme?: Theme
  iteration?: number
  dir: string
  baseline?: string
  /** The plan's stable identity (its file path); a new enqueue with the same key replaces the old. */
  key?: string
}

export async function startDaemon(opts: StartDaemonOptions): Promise<DaemonInstance> {
  const getShellHtml = opts.getShellHtml ?? buildQueueShell
  const heartbeatMs = opts.heartbeatMs ?? HEARTBEAT_MS
  const reloadGraceMs = opts.reloadGraceMs ?? RELOAD_GRACE_MS
  const plans = new Map<string, QueuedPlan>()
  /** Held SSE responses for the shell(s); each gets every queue change. */
  const eventClients = new Set<ServerResponse>()
  let counter = 0
  let shellHtml: string | null = null
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let graceTimer: ReturnType<typeof setTimeout> | undefined
  /** Which grace tier is currently armed, so a late beacon can tell a long (silent) timer apart
   * from one already running at the short (reload) tier. */
  let graceTier: 'reload' | 'silent' | undefined
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  /** When the last `POST /__vp_shell_closed` beacon landed; 0 when none is outstanding. */
  let lastCloseBeaconAt = 0
  let shuttingDown = false

  /** Runs while any events client is held: comment frames keep half-dead sockets surfacing their
   * close promptly and keep intermediaries from idle-closing. Comment frames are invisible to
   * EventSource, so this is contract-additive. */
  const startHeartbeat = (): void => {
    if (heartbeatTimer) return
    heartbeatTimer = setInterval(() => {
      for (const res of eventClients) res.write(': hb\n\n')
    }, heartbeatMs)
  }

  const stopHeartbeat = (): void => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = undefined
    }
  }

  const queueSnapshot = (): QueueEntry[] => [...plans.values()].map(p => p.entry)

  const broadcast = (): void => {
    const frame = `event: queue\ndata: ${JSON.stringify(queueSnapshot())}\n\n`
    for (const res of eventClients) res.write(frame)
  }

  // `iterating` counts as pending: it is an explicit promise of an imminent re-enqueue, so the
  // idle TTL must not fire between the iterate verdict and the revision's arrival.
  const hasPending = (): boolean =>
    [...plans.values()].some(p => p.entry.status === 'pending' || p.entry.status === 'iterating')

  const cancelIdle = (): void => {
    if (idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = undefined
    }
  }

  /** Start the idle-shutdown timer when nothing is pending; a new enqueue cancels it. Never re-arms
   * once shutdown has begun (a late verdict-close during teardown must not resurrect the timer). */
  const maybeStartIdle = (): void => {
    if (shuttingDown || hasPending()) return
    cancelIdle()
    idleTimer = setTimeout(() => void shutdown(), opts.idleMs)
  }

  /** (Re)arm the shell-gone grace timer at the given tier; expiry denies everything pending and
   * shuts down. Shared by the SSE close handler and the close-beacon route. */
  const armGrace = (ms: number, tier: 'reload' | 'silent'): void => {
    if (graceTimer) clearTimeout(graceTimer)
    graceTier = tier
    graceTimer = setTimeout(() => {
      if (eventClients.size === 0) void denyAllAndShutdown()
    }, ms)
  }

  /** Settle a plan exactly once: resolve its waiters, mark it done, broadcast, and arm the idle TTL
   * if nothing is pending. */
  const settle = (plan: QueuedPlan, feedback: Feedback): void => {
    if (plan.settled) return
    plan.settled = true
    plan.settledFeedback = feedback
    // An iterate verdict is not terminal: the entry stays listed as `iterating`, an explicit
    // promise that the agent will re-enqueue a revision under the same key.
    plan.entry.status = feedback.decision === 'iterate' ? 'iterating' : 'done'
    plan.entry.updatedAt = Date.now()
    // Record the verdict so the sidebar shows the matching icon (approve/deny/iterate), not a
    // generic "done" mark.
    plan.entry.decision = feedback.decision
    for (const resolve of plan.waiters) resolve(feedback)
    plan.waiters = []
    broadcast()
    maybeStartIdle()
  }

  /** Idempotent shutdown: ends all held connections so the event loop drains, closes the server,
   * and notifies the owner. Shared by the idle-TTL and shell-close paths. */
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    cancelIdle()
    stopHeartbeat()
    if (graceTimer) clearTimeout(graceTimer)
    // End every held connection (SSE shells, long-held verdicts) or close() hangs on them.
    for (const res of eventClients) res.end()
    eventClients.clear()
    await new Promise<void>(resolve => server.close(() => resolve()))
    // Awaited so owner cleanup (lock removal) provably completes before close() resolves; a
    // signal handler can then exit the process without racing the cleanup.
    await opts.onIdle?.()
  }

  /** Deny all still-pending plans (used when the shell goes away past the grace), then shut down. */
  const denyAllAndShutdown = async (): Promise<void> => {
    for (const plan of plans.values()) {
      if (!plan.settled) settle(plan, plan.draft)
    }
    await shutdown()
  }

  const server = createServer((req, res) => {
    void route(req, res)
  })

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const { pathname, searchParams } = new URL(req.url ?? '/', 'http://localhost')

    if (pathname === '/__vp_ping') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('ok')
      return
    }

    if (pathname === '/') {
      if (shellHtml === null) shellHtml = await getShellHtml()
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(shellHtml)
      return
    }

    if (pathname.startsWith('/plan/')) {
      const plan = plans.get(pathname.slice('/plan/'.length))
      if (!plan) {
        res.writeHead(404)
        res.end('unknown plan')
        return
      }
      // `no-store`: the id is reused across revisions (iterate-in-place), so the browser must
      // re-fetch every load instead of serving a cached prior revision.
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      })
      // A decided plan re-served carries its verdict so the page opens locked into the submitted bar.
      res.end(
        plan.settled && plan.settledFeedback
          ? withDecided(plan.html, plan.settledFeedback)
          : plan.html,
      )
      return
    }

    if (pathname === '/__vp_enqueue') {
      await handleEnqueue(req, res)
      return
    }

    if (pathname === '/__vp_verdict') {
      handleVerdict(searchParams.get('id'), req, res)
      return
    }

    if (pathname === '/__vp_feedback') {
      await handleSettleRoute(req, res, /* draftOnly */ false)
      return
    }

    if (pathname === '/__vp_draft') {
      await handleSettleRoute(req, res, /* draftOnly */ true)
      return
    }

    if (pathname === '/__vp_shell_closed') {
      // The shell's `pagehide` beacon: positive evidence of a real unload (reload, navigation, or
      // close), as opposed to a silent socket drop (suspension/sleep/crash). A no-op while
      // connected; its timestamp picks the grace tier when the socket drop follows.
      lastCloseBeaconAt = Date.now()
      // A late beacon after a silent drop means the drop WAS a real unload: tighten the long
      // grace to the reload tier.
      if (graceTimer && graceTier === 'silent') armGrace(reloadGraceMs, 'reload')
      res.writeHead(204)
      res.end()
      return
    }

    if (pathname === '/__vp_events') {
      handleEvents(res)
      return
    }

    res.writeHead(404)
    res.end('not found')
  }

  async function handleEnqueue(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body: EnqueueBody
    try {
      body = JSON.parse(await readBody(req)) as EnqueueBody
      if (typeof body.source !== 'string' || typeof body.dir !== 'string') {
        throw new Error('source and dir are required')
      }
    } catch {
      res.writeHead(400)
      res.end('invalid enqueue body')
      return
    }
    // Cancel the idle timer up front: the build below can take longer than a short idleMs, and the
    // daemon must not shut down mid-enqueue. The enqueue itself proves the daemon is wanted.
    cancelIdle()
    // A requeue (same key) UPDATES its predecessor in place, so a plan and its iterations keep one
    // stable row (and id) across revisions. The first match is the update target; any extra
    // same-key matches (defensive: should not happen) are dropped as before, unblocking their
    // waiters with their drafts so no caller can hang.
    let existing: QueuedPlan | undefined
    if (body.key !== undefined) {
      for (const [oldId, oldPlan] of plans) {
        if (oldPlan.key !== body.key) continue
        if (!existing) {
          existing = oldPlan
          continue
        }
        for (const resolve of oldPlan.waiters) resolve(oldPlan.draft)
        oldPlan.waiters = []
        plans.delete(oldId)
      }
    }
    // The id must be decided before the build: the injected plan id has to be the stable existing
    // id or feedback from the revised page would not route back to this entry.
    const id = existing ? existing.entry.id : `p${++counter}`
    // Auto-increment the review round on a same-key update so the agent needs no `-i` bookkeeping;
    // an explicit iteration still wins, and a fresh enqueue keeps whatever it sent (or nothing).
    // Computed before the build so the injected `__VP_REVIEW_ITERATION__` matches the entry.
    const iteration = existing
      ? (body.iteration ?? (existing.entry.iteration ?? 1) + 1)
      : body.iteration
    // Build BEFORE mutating any state, so a throwing build leaves the old revision servable.
    const html = await buildHtml(body.source, {
      theme: body.theme,
      baseline: body.baseline,
      review: { planId: id, iteration },
    })
    const now = Date.now()
    if (existing) {
      // Supersede: a caller still waiting on the old revision gets its draft, as before.
      for (const resolve of existing.waiters) resolve(existing.draft)
      existing.waiters = []
      existing.entry.title = titleFromSource(body.source)
      existing.entry.dir = body.dir
      existing.entry.iteration = iteration
      existing.entry.status = 'pending'
      delete existing.entry.decision
      existing.entry.rev += 1
      existing.entry.updatedAt = now
      existing.html = html
      // Un-settle: the revision awaits a fresh verdict; a new `/__vp_verdict` must long-poll, not
      // replay the stale iterate feedback, and the deny-on-close draft starts clean.
      existing.settled = false
      existing.settledFeedback = undefined
      existing.draft = { ...DEFAULT_DENY }
    } else {
      const entry: QueueEntry = {
        id,
        title: titleFromSource(body.source),
        dir: body.dir,
        status: 'pending',
        iteration,
        rev: 1,
        createdAt: now,
        updatedAt: now,
      }
      plans.set(id, {
        entry,
        key: body.key,
        html,
        waiters: [],
        draft: { ...DEFAULT_DENY },
        settled: false,
      })
    }
    broadcast()
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ id, shellConnected: eventClients.size > 0 }))
  }

  function handleVerdict(id: string | null, req: IncomingMessage, res: ServerResponse): void {
    const plan = id ? plans.get(id) : undefined
    if (!plan) {
      res.writeHead(404)
      res.end('unknown plan')
      return
    }
    if (plan.settled) {
      // Already decided: answer immediately with the feedback it settled with (its waiters were
      // already resolved at settle time), not the deny-on-close draft.
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(plan.settledFeedback ?? plan.draft))
      return
    }
    let responded = false
    plan.waiters.push((feedback: Feedback) => {
      if (responded) return
      responded = true
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(feedback))
    })
    // If the caller disconnects before the plan settles, they abandoned it: drop the plan, broadcast,
    // and arm the idle timer if the queue is now empty. A plan no one awaits is dead weight.
    req.on('close', () => {
      if (responded || plan.settled) return
      plans.delete(plan.entry.id)
      broadcast()
      maybeStartIdle()
    })
  }

  async function handleSettleRoute(
    req: IncomingMessage,
    res: ServerResponse,
    draftOnly: boolean,
  ): Promise<void> {
    let feedback: Feedback
    try {
      feedback = feedbackSchema.parse(JSON.parse(await readBody(req)))
    } catch {
      res.writeHead(400)
      res.end('invalid body')
      return
    }
    const plan = feedback.planId ? plans.get(feedback.planId) : undefined
    if (!plan) {
      res.writeHead(404)
      res.end('unknown plan')
      return
    }
    if (draftOnly) {
      plan.draft = feedback
    } else {
      // Feedback for an already-settled plan is an idempotent no-op (the first decision won).
      settle(plan, feedback)
    }
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('ok')
  }

  function handleEvents(res: ServerResponse): void {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    // A new shell cancels any in-flight grace shutdown: the shell is back. Any outstanding close
    // beacon belonged to the connection that just ended; it must not tag a future drop.
    if (graceTimer) {
      clearTimeout(graceTimer)
      graceTimer = undefined
      graceTier = undefined
    }
    lastCloseBeaconAt = 0
    eventClients.add(res)
    startHeartbeat()
    res.write(`event: queue\ndata: ${JSON.stringify(queueSnapshot())}\n\n`)
    res.on('close', () => {
      eventClients.delete(res)
      // When the LAST shell closes, wait a grace window; if still none reconnect, deny all pending
      // plans and shut down. The events stream is the shell's liveness signal. The tier depends on
      // the evidence: a close beacon just before the drop means a real unload (short grace); a
      // silent drop is suspension/sleep/crash or a lost beacon, so hold for the idle horizon
      // (EventSource auto-reconnects on resume, which cancels the grace).
      if (eventClients.size === 0 && !shuttingDown) {
        stopHeartbeat()
        if (Date.now() - lastCloseBeaconAt <= BEACON_ASSOC_MS) armGrace(reloadGraceMs, 'reload')
        else armGrace(opts.idleMs, 'silent')
      }
    })
  }

  await new Promise<void>(resolve => server.listen(opts.port, resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : opts.port
  // Arm the idle timer from an empty start so a daemon nobody enqueues to does not linger forever.
  maybeStartIdle()

  return {
    port,
    close: () => shutdown(),
  }
}
