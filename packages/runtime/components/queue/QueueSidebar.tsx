import type { QueueEntry } from '@visualplan/core'
import {
  IconCircle,
  IconCircleCheckFilled,
  IconCircleXFilled,
  IconRefresh,
} from '@tabler/icons-react'
import { reviewedCount } from './logic.js'

/** The status indicator for a row: an open circle while pending, otherwise the icon for the verdict
 * the reviewer locked in (matching the decision bar: check / cross / iterate). */
function StatusIcon({ entry }: { entry: QueueEntry }) {
  if (entry.status !== 'done') return <IconCircle size={16} />
  if (entry.decision === 'deny') return <IconCircleXFilled size={16} />
  if (entry.decision === 'iterate') return <IconRefresh size={16} />
  return <IconCircleCheckFilled size={16} />
}

/** The reviewer-facing word for a row's state, used in its accessible name (status is otherwise
 * conveyed only by an icon and color). */
function statusLabel(entry: QueueEntry): string {
  if (entry.status !== 'done') return 'to review'
  if (entry.decision === 'deny') return 'denied'
  if (entry.decision === 'iterate') return 'needs iteration'
  return 'approved'
}

/**
 * The left rail of the Review Queue shell: one row per queued plan with its title, the originating
 * directory (muted, so plans from different projects stay distinguishable in the one machine-wide
 * queue), and a status indicator (an open circle while pending, a filled check once reviewed). A
 * progress count summarizes how many of the queue have been decided. Pure presentation: navigation
 * and active state are owned by `QueueShell`.
 */
export function QueueSidebar({
  entries,
  activeId,
  onSelect,
}: {
  entries: QueueEntry[]
  activeId: string | null
  onSelect: (id: string) => void
}) {
  const reviewed = reviewedCount(entries)
  return (
    <aside className='vp-queue__sidebar'>
      <header className='vp-queue__head'>
        <span className='vp-queue__title'>Plans to Review</span>
        <span className='vp-queue__count'>
          {reviewed} of {entries.length} reviewed
        </span>
      </header>
      <ul className='vp-queue__list'>
        {entries.map((entry, index) => {
          const done = entry.status === 'done'
          const isActive = entry.id === activeId
          // Roving tabindex: only the active row is in the tab order (arrow/j-k move between rows),
          // so focus and the active plan stay in sync. When nothing is active yet, the first row is
          // the entry point so the list is never unreachable by keyboard.
          const tabbable = activeId ? isActive : index === 0
          // v1 is the baseline (no chip); a re-review shows its revision so the version is visible.
          const version = entry.iteration && entry.iteration >= 2 ? `v${entry.iteration}` : null
          const label = `${entry.title}, ${entry.dir}${version ? `, ${version}` : ''}, ${statusLabel(entry)}`
          return (
            <li key={entry.id}>
              <button
                type='button'
                className='vp-queue__row'
                data-active={isActive}
                data-done={done}
                data-decision={done ? entry.decision : undefined}
                tabIndex={tabbable ? 0 : -1}
                aria-current={isActive ? 'true' : undefined}
                // The status icon and version chip are decorative (aria-hidden / from the label), so
                // the row name carries the dir, version, and status in words, and separates the title
                // from the origin dir that otherwise ran together.
                aria-label={label}
                onClick={() => onSelect(entry.id)}
              >
                <span className='vp-queue__status' aria-hidden='true'>
                  <StatusIcon entry={entry} />
                </span>
                <span className='vp-queue__rowtext'>
                  <span className='vp-queue__rowtitle'>{entry.title}</span>
                  <span className='vp-queue__rowdir'>{entry.dir}</span>
                </span>
                {version && (
                  <span className='vp-queue__chip' aria-hidden='true'>
                    {version}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
