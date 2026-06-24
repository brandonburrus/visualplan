import type { Feedback } from '@visualplan/core'

/** The endpoint the review server (`compile.ts` `reviewPlugin`) exposes for the decision payload. */
const FEEDBACK_ENDPOINT = '/__vp_feedback'

/** True when the CLI started the page in review mode (`__VP_REVIEW__` injected by `reviewPlugin`). */
export function isReviewMode(): boolean {
  return (globalThis as { __VP_REVIEW__?: boolean }).__VP_REVIEW__ === true
}

/** POST the decision to the CLI, which resolves the blocking session. Returns whether it was accepted. */
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
 * Send the decision during page unload. A normal `fetch` is cancelled mid-unload, so the tab-close
 * deny must go out via `sendBeacon`, which the browser flushes even as the page tears down.
 */
export function beaconFeedback(feedback: Feedback): void {
  const blob = new Blob([JSON.stringify(feedback)], { type: 'application/json' })
  navigator.sendBeacon(FEEDBACK_ENDPOINT, blob)
}
