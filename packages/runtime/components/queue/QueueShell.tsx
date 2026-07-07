import type { QueueEntry } from '@visualplan/core'
import { IconChecklist } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { setActivityDot } from './favicon.js'
import {
  hasNewActivity,
  moveSelection,
  nextActiveId,
  reviewedCount,
  revisingCount,
  unseenRevs,
} from './logic.js'
import { QueueSidebar } from './QueueSidebar.js'
import './queue.css'

/** The daemon's SSE endpoint, which doubles as the tab's liveness signal. */
const EVENTS_ENDPOINT = '/__vp_events'

/** POSTed via sendBeacon on pagehide as positive evidence of a real unload, letting the daemon arm
 * its short deny grace instead of the long silent one (a suspended tab drops the SSE without this
 * beacon). Fired on every pagehide: a reload's SSE reconnect cancels the short grace. */
const SHELL_CLOSED_ENDPOINT = '/__vp_shell_closed'

/**
 * The Review Queue shell the daemon serves at `/`: a left sidebar of queued plans and the active plan
 * hosted in a same-origin iframe (`/plan/<id>`). It holds the daemon's `/__vp_events` SSE open for the
 * page's lifetime, which is the daemon's liveness signal (closing the tab tears the daemon down), so
 * the stream is closed only on unmount. The shell renders no plan content itself: it is pure chrome
 * plus the iframe, and each plan iframe carries its own review chrome in queue mode.
 */
export function QueueShell() {
  const [entries, setEntries] = useState<QueueEntry[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  // The latest active id, read inside the stream handler without making it a dependency (re-opening
  // the SSE on every selection would drop the daemon's liveness connection).
  const activeRef = useRef<string | null>(activeId)
  activeRef.current = activeId

  // Whether any plan is still undecided, read by the stable beforeunload handler below (same
  // pattern as activeRef: the handler must be attached once, not re-bound per frame).
  const pendingRef = useRef(false)
  pendingRef.current = entries.some(e => e.status === 'pending' || e.status === 'active')

  const containerRef = useRef<HTMLDivElement>(null)
  // Set when an active change came from keyboard nav (not an SSE-driven auto-advance), so focus
  // follows the selection then but never gets yanked out from under the user on a background update.
  const keyboardNavRef = useRef(false)

  // A whole-tab favicon dot raised when the queue gains activity (a plan added or updated) while
  // the tab is backgrounded, cleared when the user focuses the tab again; prevEntriesRef diffs
  // against the last queue to tell new activity from a no-op redraw. Distinct from the per-plan
  // unseen-revision dots derived further down.
  const [faviconUnseen, setFaviconUnseen] = useState(false)
  const prevEntriesRef = useRef<QueueEntry[]>([])

  useEffect(() => {
    const source = new EventSource(EVENTS_ENDPOINT)
    const onQueue = (event: MessageEvent) => {
      const next = JSON.parse(event.data) as QueueEntry[]
      // Read the previous frame BEFORE overwriting the ref: nextActiveId compares the two frames to
      // advance only when the active plan turned done in this frame.
      const prev = prevEntriesRef.current
      if (document.hidden && hasNewActivity(prev, next)) setFaviconUnseen(true)
      prevEntriesRef.current = next
      setEntries(next)
      // Default to the first pending plan, and auto-advance once the active plan is marked done.
      setActiveId(nextActiveId(prev, next, activeRef.current))
    }
    source.addEventListener('queue', onQueue)
    return () => {
      source.removeEventListener('queue', onQueue)
      source.close()
    }
  }, [])

  // Clear the activity dot once the tab is in the foreground again; reflect the flag on the favicon.
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) setFaviconUnseen(false)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  useEffect(() => {
    setActivityDot(faviconUnseen)
  }, [faviconUnseen])

  // Tell the daemon this was a real unload (close/reload/navigation), not a silent socket drop.
  useEffect(() => {
    const onPageHide = () => {
      if (typeof navigator.sendBeacon === 'function') navigator.sendBeacon(SHELL_CLOSED_ENDPOINT)
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [])

  // Closing the tab with undecided plans denies them (the daemon's deny-on-close), so raise the
  // native leave-page confirm then. An 'iterating' plan is already resolved to its caller, so it
  // does not block a close; nor do decided plans or an empty queue.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!pendingRef.current) return
      event.preventDefault()
      // Legacy channel some browsers still require to show the confirm.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // j/k or arrow keys move the active selection; the in-iframe review UI handles every other key.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const delta =
        event.key === 'j' || event.key === 'ArrowDown'
          ? 1
          : event.key === 'k' || event.key === 'ArrowUp'
            ? -1
            : 0
      if (delta === 0) return
      event.preventDefault()
      keyboardNavRef.current = true
      setActiveId(current => moveSelection(entries, current, delta))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [entries])

  // After a keyboard move, pull focus to the now-active row so focus and selection stay together
  // (the roving tabindex makes it the only tabbable row). Skipped for SSE-driven auto-advances.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refocus on every active-plan change
  useEffect(() => {
    if (!keyboardNavRef.current) return
    keyboardNavRef.current = false
    containerRef.current?.querySelector<HTMLElement>('.vp-queue__row[tabindex="0"]')?.focus()
  }, [activeId])

  // The plan to host in the iframe: whichever row is selected, pending or already decided (a decided
  // plan re-opens locked into its verdict). The empty state shows only when nothing is selected.
  const activeEntry = entries.find(entry => entry.id === activeId) ?? null
  const activeRev = activeEntry?.rev ?? 1

  // Per-plan unseen-revision dots (distinct from the whole-tab `faviconUnseen` flag above): the
  // active plan's rev is recorded as seen whenever it is shown, and any OTHER entry whose rev moved
  // past its seen rev gets an accent dot on its sidebar row instead of stealing focus.
  const seenRevsRef = useRef(new Map<string, number>())
  useEffect(() => {
    if (activeId) seenRevsRef.current.set(activeId, activeRev)
  }, [activeId, activeRev])
  const unseenIds = unseenRevs(entries, seenRevsRef.current, activeId)

  // A coarse clock for the sidebar's relative timestamps: a 30s tick keeps "Nm ago" fresh between
  // queue frames without re-rendering more often than the coarsest bucket needs.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  // Announced to assistive tech as the queue changes (a plan reviewed, the active plan advancing, a
  // new plan arriving), which are otherwise silent visual updates.
  const activeTitle = activeEntry?.title ?? null

  // The tab title tracks the plan being reviewed, so a backgrounded tab is identifiable; it falls
  // back to the queue name when nothing is active (empty or all reviewed).
  useEffect(() => {
    document.title = activeTitle || 'Visual Plan Review Queue'
  }, [activeTitle])
  const revising = revisingCount(entries)
  const announcement =
    entries.length === 0
      ? ''
      : `${reviewedCount(entries)} of ${entries.length} plans reviewed${
          revising > 0 ? `, ${revising} awaiting revision` : ''
        }${activeTitle ? `. Now reviewing ${activeTitle}` : '.'}`

  return (
    <div ref={containerRef} className='vp-queue'>
      <div className='vp-sr-only' role='status' aria-live='polite'>
        {announcement}
      </div>
      {/* Always rendered, even for a lone plan: the rail carries the session's history and status. */}
      <QueueSidebar
        entries={entries}
        activeId={activeId}
        unseen={unseenIds}
        now={now}
        onSelect={setActiveId}
      />
      <main className='vp-queue__main'>
        {activeEntry ? (
          <iframe
            // Re-key on id AND rev: ids are now stable across in-place revisions, so a rev bump must
            // remount the iframe with the revised plan while swapping rows still gets a fresh frame.
            // The daemon's router matches the pathname prefix and ignores the query; `?rev=` is a
            // cache-buster since the same /plan/<id> URL now serves successive revisions.
            key={`${activeEntry.id}:${activeEntry.rev ?? 1}`}
            className='vp-queue__frame'
            src={`/plan/${activeEntry.id}?rev=${activeEntry.rev ?? 1}`}
            title='Active plan under review'
          />
        ) : (
          <QueueEmpty hasEntries={entries.length > 0} />
        )}
      </main>
    </div>
  )
}

/** The resting state: all queued plans reviewed, or the queue is momentarily empty. */
function QueueEmpty({ hasEntries }: { hasEntries: boolean }) {
  return (
    <div className='vp-queue__empty'>
      <IconChecklist size={32} stroke={1.5} />
      <p>{hasEntries ? 'All plans reviewed' : 'No plans in the queue'}</p>
    </div>
  )
}
