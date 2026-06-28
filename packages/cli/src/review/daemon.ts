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
  /** Called once when the daemon shuts down (idle TTL or shell close), so the owner can clean up
   * its lock and exit the process. */
  onIdle?: () => void
}

/** The default Deny resolved for a pending plan that is abandoned (tab/shell closed) with no draft. */
const DEFAULT_DENY: Feedback = { decision: 'deny', comments: [], answers: [] }

/** Grace window after the last events (shell) connection closes before denying pending plans, so a
 * page reload that briefly drops then reconnects survives. */
const SHELL_GRACE_MS = 1500

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

/** One queued plan's full server-side state. */
interface QueuedPlan {
  entry: QueueEntry
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
}

export async function startDaemon(opts: StartDaemonOptions): Promise<DaemonInstance> {
  const getShellHtml = opts.getShellHtml ?? buildQueueShell
  const plans = new Map<string, QueuedPlan>()
  /** Held SSE responses for the shell(s); each gets every queue change. */
  const eventClients = new Set<ServerResponse>()
  let counter = 0
  let shellHtml: string | null = null
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let graceTimer: ReturnType<typeof setTimeout> | undefined
  let shuttingDown = false

  const queueSnapshot = (): QueueEntry[] => [...plans.values()].map(p => p.entry)

  const broadcast = (): void => {
    const frame = `event: queue\ndata: ${JSON.stringify(queueSnapshot())}\n\n`
    for (const res of eventClients) res.write(frame)
  }

  const hasPending = (): boolean => [...plans.values()].some(p => p.entry.status === 'pending')

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

  /** Settle a plan exactly once: resolve its waiters, mark it done, broadcast, and arm the idle TTL
   * if nothing is pending. */
  const settle = (plan: QueuedPlan, feedback: Feedback): void => {
    if (plan.settled) return
    plan.settled = true
    plan.settledFeedback = feedback
    plan.entry.status = 'done'
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
    if (graceTimer) clearTimeout(graceTimer)
    // End every held connection (SSE shells, long-held verdicts) or close() hangs on them.
    for (const res of eventClients) res.end()
    eventClients.clear()
    await new Promise<void>(resolve => server.close(() => resolve()))
    opts.onIdle?.()
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
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(plan.html)
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
    counter += 1
    const id = `p${counter}`
    const html = await buildHtml(body.source, {
      theme: body.theme,
      baseline: body.baseline,
      review: { planId: id, iteration: body.iteration },
    })
    const entry: QueueEntry = {
      id,
      title: titleFromSource(body.source),
      dir: body.dir,
      status: 'pending',
    }
    plans.set(id, { entry, html, waiters: [], draft: { ...DEFAULT_DENY }, settled: false })
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
    // A new shell cancels any in-flight grace shutdown: the shell is back.
    if (graceTimer) {
      clearTimeout(graceTimer)
      graceTimer = undefined
    }
    eventClients.add(res)
    res.write(`event: queue\ndata: ${JSON.stringify(queueSnapshot())}\n\n`)
    res.on('close', () => {
      eventClients.delete(res)
      // When the LAST shell closes, wait a grace window; if still none reconnect, deny all pending
      // plans and shut down. The events stream is the shell's liveness signal.
      if (eventClients.size === 0 && !shuttingDown) {
        if (graceTimer) clearTimeout(graceTimer)
        graceTimer = setTimeout(() => {
          if (eventClients.size === 0) void denyAllAndShutdown()
        }, SHELL_GRACE_MS)
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
