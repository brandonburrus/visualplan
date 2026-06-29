import type { QueueEntry } from '@visualplan/core'

/**
 * Pure queue-navigation logic for the Review Queue shell, factored out of `QueueShell` so the
 * active-plan and selection rules are unit-testable without rendering. A plan counts as "still to
 * review" until its status is `done`; the daemon may surface a transient `active` status, which is
 * treated the same as `pending` here (not yet reviewed).
 */

/** True once the daemon has resolved this plan; it is no longer a review target. */
function isDone(entry: QueueEntry): boolean {
  return entry.status === 'done'
}

/** The id of the first entry still awaiting review, or null when the whole queue is done/empty. */
export function firstPendingId(entries: QueueEntry[]): string | null {
  return entries.find(e => !isDone(e))?.id ?? null
}

/**
 * The id the shell should show given the current `activeId`. The active plan stays put while it is
 * still pending; once the daemon marks it done (observed via the SSE stream) the shell auto-advances
 * to the next pending plan. An unknown active id (or none) falls back to the first pending plan.
 */
export function nextActiveId(entries: QueueEntry[], activeId: string | null): string | null {
  const active = entries.find(e => e.id === activeId)
  if (active && !isDone(active)) return active.id
  return firstPendingId(entries)
}

/**
 * Move the selection by `delta` rows (j/k or arrow keys), clamped to the queue bounds so paging past
 * an end is a no-op. With nothing selected, a move selects the first entry. Selection is positional
 * across every entry, done or not, since the reviewer may want to revisit a finished plan.
 */
export function moveSelection(
  entries: QueueEntry[],
  activeId: string | null,
  delta: number,
): string | null {
  if (entries.length === 0) return null
  const current = entries.findIndex(e => e.id === activeId)
  if (current === -1) return entries[0]?.id ?? null
  const next = Math.min(Math.max(current + delta, 0), entries.length - 1)
  return entries[next]?.id ?? null
}

/** How many queued plans have been reviewed, for the "N of M reviewed" progress count. */
export function reviewedCount(entries: QueueEntry[]): number {
  return entries.filter(isDone).length
}

/**
 * Whether `next` represents new queue activity versus `prev`: a plan was added (a new id) or an
 * existing plan changed status or version (a re-review). A plan only being removed is not activity
 * to flag. Used to badge the tab while it is backgrounded.
 */
export function hasNewActivity(prev: QueueEntry[], next: QueueEntry[]): boolean {
  return next.some(entry => {
    const before = prev.find(p => p.id === entry.id)
    return !before || before.status !== entry.status || before.iteration !== entry.iteration
  })
}
