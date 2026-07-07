import type { QueueEntry } from '@visualplan/core'

/**
 * Pure queue-navigation logic for the Review Queue shell, factored out of `QueueShell` so the
 * active-plan and selection rules are unit-testable without rendering. A plan is a review target
 * only while `pending` (or the daemon's transient `active`, treated the same): a `done` plan is
 * decided, and an `iterating` one is waiting on the agent's revision, so neither is auto-advanced
 * to. In-place revisions bump `rev`, which drives the unseen-update dots and activity flagging.
 */

/** True once the daemon has resolved this plan; it is no longer a review target. */
function isDone(entry: QueueEntry): boolean {
  return entry.status === 'done'
}

/** True while the plan awaits the reviewer: `pending` or the daemon's transient `active`. An
 * `iterating` entry is excluded — it has nothing new to review until the revision arrives. */
function isReviewTarget(entry: QueueEntry): boolean {
  return entry.status === 'pending' || entry.status === 'active'
}

/** The id of the first entry still awaiting review, or null when nothing is reviewable. */
export function firstPendingId(entries: QueueEntry[]): string | null {
  return entries.find(isReviewTarget)?.id ?? null
}

/**
 * The id the shell should show after a queue frame, given the previous frame and the current
 * `activeId`. The active plan stays put unless it transitioned to `done` in THIS frame (approve or
 * deny), in which case the shell auto-advances to the first pending plan. Staying put deliberately
 * covers: still pending; just flipped to `iterating` (show the waiting state); an
 * `iterating`-to-`pending` rev bump (the iframe swaps content in place); and an entry that is
 * `done` in both frames (viewing an already-decided plan must not get yanked to the first pending
 * plan by an unrelated frame). No active id, or one that vanished, falls back to the first pending.
 */
export function nextActiveId(
  prev: QueueEntry[],
  next: QueueEntry[],
  activeId: string | null,
): string | null {
  const active = next.find(e => e.id === activeId)
  if (active) {
    const before = prev.find(p => p.id === activeId)
    const becameDone = isDone(active) && !(before && isDone(before))
    if (!becameDone) return active.id
  }
  return firstPendingId(next)
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
 * Ids whose serving revision moved past what the reviewer last saw, excluding the active entry
 * (the user is looking at it). A never-seen id defaults to a last-seen rev of 1, so a brand-new
 * plan at rev 1 gets no dot (it reads as a normal new row, not an update) while an entry arriving
 * already revised does.
 */
export function unseenRevs(
  entries: QueueEntry[],
  seen: ReadonlyMap<string, number>,
  activeId: string | null,
): Set<string> {
  const unseen = new Set<string>()
  for (const entry of entries) {
    if (entry.id === activeId) continue
    if ((entry.rev ?? 1) > (seen.get(entry.id) ?? 1)) unseen.add(entry.id)
  }
  return unseen
}

/** How many plans are `iterating` (verdict delivered, revision not yet re-enqueued). */
export function revisingCount(entries: QueueEntry[]): number {
  return entries.filter(e => e.status === 'iterating').length
}

/** A coarse relative timestamp for a sidebar row: 'just now' under a minute, then whole minutes,
 * hours, and days. A future `thenMs` (clock skew) clamps to 'just now'. */
export function relativeTime(nowMs: number, thenMs: number): string {
  const minutes = Math.floor(Math.max(0, nowMs - thenMs) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`
  return `${Math.floor(minutes / (24 * 60))}d ago`
}

/**
 * Whether `next` represents new queue activity versus `prev`: a plan was added (a new id) or an
 * existing plan changed status, version, or serving revision (an in-place re-review). A plan only
 * being removed is not activity to flag. Used to badge the tab while it is backgrounded.
 */
export function hasNewActivity(prev: QueueEntry[], next: QueueEntry[]): boolean {
  return next.some(entry => {
    const before = prev.find(p => p.id === entry.id)
    return (
      !before ||
      before.status !== entry.status ||
      before.iteration !== entry.iteration ||
      before.rev !== entry.rev
    )
  })
}
