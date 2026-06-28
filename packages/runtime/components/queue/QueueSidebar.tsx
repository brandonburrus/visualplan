import type { QueueEntry } from '@visualplan/core'
import { IconCircle, IconCircleCheckFilled } from '@tabler/icons-react'
import { reviewedCount } from './logic.js'

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
        <span className='vp-queue__title'>Review queue</span>
        <span className='vp-queue__count'>
          {reviewed} of {entries.length} reviewed
        </span>
      </header>
      <ul className='vp-queue__list'>
        {entries.map(entry => {
          const done = entry.status === 'done'
          return (
            <li key={entry.id}>
              <button
                type='button'
                className='vp-queue__row'
                data-active={entry.id === activeId}
                data-done={done}
                aria-current={entry.id === activeId ? 'true' : undefined}
                onClick={() => onSelect(entry.id)}
              >
                <span className='vp-queue__status' aria-hidden='true'>
                  {done ? <IconCircleCheckFilled size={16} /> : <IconCircle size={16} />}
                </span>
                <span className='vp-queue__rowtext'>
                  <span className='vp-queue__rowtitle'>{entry.title}</span>
                  <span className='vp-queue__rowdir'>{entry.dir}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
