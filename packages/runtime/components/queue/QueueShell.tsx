import type { QueueEntry } from '@visualplan/core'
import { IconChecklist } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { firstPendingId, moveSelection, nextActiveId, reviewedCount } from './logic.js'
import { QueueSidebar } from './QueueSidebar.js'
import './queue.css'

/** The daemon's SSE endpoint, which doubles as the tab's liveness signal. */
const EVENTS_ENDPOINT = '/__vp_events'

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

  const containerRef = useRef<HTMLDivElement>(null)
  // Set when an active change came from keyboard nav (not an SSE-driven auto-advance), so focus
  // follows the selection then but never gets yanked out from under the user on a background update.
  const keyboardNavRef = useRef(false)

  useEffect(() => {
    const source = new EventSource(EVENTS_ENDPOINT)
    const onQueue = (event: MessageEvent) => {
      const next = JSON.parse(event.data) as QueueEntry[]
      setEntries(next)
      // Default to the first pending plan, and auto-advance once the active plan is marked done.
      setActiveId(nextActiveId(next, activeRef.current))
    }
    source.addEventListener('queue', onQueue)
    return () => {
      source.removeEventListener('queue', onQueue)
      source.close()
    }
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

  const hasPending = firstPendingId(entries) !== null
  // The sidebar is for navigating BETWEEN plans, so a lone plan shows none: it reads as an ordinary
  // single review. It appears the moment a second plan joins the queue (the SSE drives this live).
  const showSidebar = entries.length > 1

  // Announced to assistive tech as the queue changes (a plan reviewed, the active plan advancing, a
  // new plan arriving), which are otherwise silent visual updates.
  const activeTitle = entries.find(entry => entry.id === activeId)?.title ?? null

  // The tab title tracks the plan being reviewed, so a backgrounded tab is identifiable; it falls
  // back to the queue name when nothing is active (empty or all reviewed).
  useEffect(() => {
    document.title = activeTitle || 'Plans to Review'
  }, [activeTitle])
  const announcement =
    entries.length === 0
      ? ''
      : `${reviewedCount(entries)} of ${entries.length} plans reviewed${
          activeTitle ? `. Now reviewing ${activeTitle}` : '.'
        }`

  return (
    <div ref={containerRef} className={showSidebar ? 'vp-queue' : 'vp-queue vp-queue--solo'}>
      <div className='vp-sr-only' role='status' aria-live='polite'>
        {announcement}
      </div>
      {showSidebar && <QueueSidebar entries={entries} activeId={activeId} onSelect={setActiveId} />}
      <main className='vp-queue__main'>
        {activeId && hasPending ? (
          <iframe
            // Re-key on the active id so swapping plans remounts the iframe (a fresh review session)
            // rather than navigating the same frame.
            key={activeId}
            className='vp-queue__frame'
            src={`/plan/${activeId}`}
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
