import type { Feedback } from '@visualplan/core'

/** The review server (`compile.ts` `reviewPlugin`) endpoints. */
const FEEDBACK_ENDPOINT = '/__vp_feedback'
const DRAFT_ENDPOINT = '/__vp_draft'
const ALIVE_ENDPOINT = '/__vp_alive'

/** True when the CLI started the page in review mode (`__VP_REVIEW__` injected by `reviewPlugin`). */
export function isReviewMode(): boolean {
  return (globalThis as { __VP_REVIEW__?: boolean }).__VP_REVIEW__ === true
}

/**
 * True when the page is a self-contained **demo** of review mode (the docs site), with no CLI server
 * behind it. In demo mode the decision buttons are live but stay in-page: nothing is POSTed, the tab
 * is never closed, and the beforeunload prompt and keepalive/draft server chatter are skipped. Set by
 * the embedding page (`__VP_REVIEW_DEMO__`), mirroring how the CLI injects `__VP_REVIEW__`.
 */
export function isReviewDemo(): boolean {
  return (globalThis as { __VP_REVIEW_DEMO__?: boolean }).__VP_REVIEW_DEMO__ === true
}

/** The plan revision number from the CLI's `--iteration` flag, or null when it was not passed. */
export function reviewIteration(): number | null {
  const value = (globalThis as { __VP_REVIEW_ITERATION__?: number }).__VP_REVIEW_ITERATION__
  return typeof value === 'number' ? value : null
}

/** POST the explicit decision to the CLI, which resolves the blocking session. Returns whether it was accepted. */
export async function postFeedback(feedback: Feedback): Promise<boolean> {
  try {
    const res = await fetch(FEEDBACK_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(feedback),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Keep the server's Deny-on-close payload current. The server resolves with this draft if the tab
 * closes without a decision, so the comments made so far still reach the agent. Fire-and-forget.
 */
export function postDraft(feedback: Feedback): void {
  void fetch(DRAFT_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(feedback),
  }).catch(() => {})
}

/**
 * Open a connection the server holds for the tab's lifetime. When the tab closes, this socket drops
 * and the server detects it (resolving Deny), which is reliable on a real close where an unload-time
 * `sendBeacon` is not. Returns the controller so the caller can abort it on unmount.
 */
export function openKeepalive(): AbortController {
  const controller = new AbortController()
  void fetch(ALIVE_ENDPOINT, { signal: controller.signal }).catch(() => {})
  return controller
}
