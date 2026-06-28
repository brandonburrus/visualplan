/**
 * Client-side helpers a `vplan review`/`render --review` invocation uses to talk to the Review Queue
 * daemon over its frozen HTTP contract: enqueue a plan, then long-poll its verdict. These run in the
 * foreground CLI process (the daemon is a separate detached process).
 */
import type { Feedback } from '@visualplan/core'
import type { Theme } from '../config.js'

/** The enqueue request body the daemon's `/__vp_enqueue` validates. */
export interface EnqueueRequest {
  source: string
  theme?: Theme
  iteration?: number
  dir: string
  baseline?: string
  /** The plan's stable identity (its file path); a requeue with the same key replaces the prior
   * version in the queue, so a plan and its iterations appear once. Omitted for stdin. */
  key?: string
}

/** The daemon's enqueue response: the assigned plan id and whether a shell tab is already connected
 * (the CLI opens a browser only when none is). */
export interface EnqueueResponse {
  id: string
  shellConnected: boolean
}

/** POST a plan to the daemon's queue. Rejects on any non-200 so the caller never proceeds on a
 * failed enqueue. */
export async function enqueuePlan(port: number, req: EnqueueRequest): Promise<EnqueueResponse> {
  const res = await fetch(`http://localhost:${port}/__vp_enqueue`, {
    method: 'POST',
    body: JSON.stringify(req),
  })
  if (res.status !== 200) throw new Error(`enqueue failed: HTTP ${res.status}`)
  return res.json() as Promise<EnqueueResponse>
}

/**
 * Long-poll the daemon for a queued plan's verdict. The daemon holds the connection open until the
 * plan settles (decision or tab-close Deny), then responds with the Feedback. An optional `signal`
 * lets the caller abort (e.g. its own `--timeout`), which rejects and tears the connection down so
 * the daemon sees the disconnect and drops the abandoned plan. Rejects on a 404 (unknown id).
 */
export async function awaitVerdict(
  port: number,
  id: string,
  signal?: AbortSignal,
): Promise<Feedback> {
  const res = await fetch(`http://localhost:${port}/__vp_verdict?id=${encodeURIComponent(id)}`, {
    signal,
  })
  if (res.status !== 200) throw new Error(`verdict failed: HTTP ${res.status}`)
  return res.json() as Promise<Feedback>
}
