/**
 * Client-side helpers a `vplan review`/`render --review` invocation uses to talk to the Review Queue
 * daemon over its frozen HTTP contract: enqueue a plan, then long-poll its verdict. These run in the
 * foreground CLI process (the daemon is a separate detached process).
 */
import { request as httpRequest } from 'node:http'
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
  /** Show the plan's share button. Omitted keeps the daemon's default (on), so a client that does
   * not send it (an older CLI) still shares. */
  enableSharing?: boolean
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
 *
 * Uses `node:http` rather than the global `fetch` on purpose: undici's default `headersTimeout`
 * (5 min) kills a held-open response before the caller's own `--timeout` can, so a review would
 * exit code 3 after exactly 5 minutes of idle. `node:http` has no such timer, leaving the caller's
 * AbortSignal as the only bound on the wait.
 */
export async function awaitVerdict(
  port: number,
  id: string,
  signal?: AbortSignal,
): Promise<Feedback> {
  return new Promise<Feedback>((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: 'localhost',
        port,
        path: `/__vp_verdict?id=${encodeURIComponent(id)}`,
      },
      res => {
        if (res.statusCode !== 200) {
          res.resume() // drain so the connection can be reused
          reject(new Error(`verdict failed: HTTP ${res.statusCode}`))
          return
        }
        let body = ''
        res.setEncoding('utf8')
        res.on('data', chunk => (body += chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(body) as Feedback)
          } catch (error) {
            reject(error)
          }
        })
      },
    )
    req.on('error', reject)
    if (signal) {
      const abort = () => req.destroy(new Error('aborted'))
      if (signal.aborted) {
        abort()
      } else {
        signal.addEventListener('abort', abort, { once: true })
      }
    }
    req.end()
  })
}
