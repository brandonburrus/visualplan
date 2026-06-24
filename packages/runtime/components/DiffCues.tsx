import { IconGitCommit } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import {
  applyWordHighlights,
  type DiffStatus,
  diffOverlays,
  insertedWordRanges,
  isChanged,
  readDiff,
  sectionOwnedElements,
} from './review/diff.js'
import { collectSections, type Section } from './review/SectionComments.js'
import './diff.css'

/** The status color token for a changed section's gutter bar (added = done-green, edited = amber). */
const STATUS_COLOR: Record<DiffStatus, string> = {
  added: 'var(--vp-done)',
  edited: 'var(--vp-modify)',
  unchanged: 'transparent',
}

/**
 * Iteration diff cues: a git-gutter-style left edge-accent bar beside each added/edited section, a
 * summary chip with the change counts, and an "only changes" toggle that fades unchanged sections.
 * Renders whenever the CLI injected `__VP_DIFF__` (a render/watch/review with a baseline), not just in
 * review mode. Everything is fixed-position overlay; the plan DOM is never touched.
 */
export function DiffCues() {
  const diff = readDiff()
  if (!diff) return null
  return <DiffOverlay diff={diff} />
}

function DiffOverlay({ diff }: { diff: NonNullable<ReturnType<typeof readDiff>> }) {
  const [sections, setSections] = useState<Section[]>([])
  const [onlyChanges, setOnlyChanges] = useState(false)
  // Overlays read live rects, so a scroll/resize must re-render them to stay pinned to the content.
  const [, setTick] = useState(0)

  useEffect(() => setSections(collectSections()), [])

  useEffect(() => {
    const onReflow = () => setTick(tick => tick + 1)
    window.addEventListener('scroll', onReflow, { passive: true })
    window.addEventListener('resize', onReflow)
    return () => {
      window.removeEventListener('scroll', onReflow)
      window.removeEventListener('resize', onReflow)
    }
  }, [])

  // "Only changes" also reveals the exact words that changed: word-diff each edited section's body
  // against its baseline prose and register the inserted words as a CSS Custom Highlight (no DOM
  // mutation). Cleared whenever the toggle is off, the counts mismatch, or the component unmounts.
  useEffect(() => {
    if (!onlyChanges || sections.length !== diff.sections.length) return applyWordHighlights([])
    const ranges = sections.flatMap((section, index) => {
      const entry = diff.sections[index]
      return entry?.status === 'edited' && entry.prev
        ? insertedWordRanges(sectionOwnedElements(section), entry.prev)
        : []
    })
    return applyWordHighlights(ranges)
  }, [onlyChanges, sections, diff])

  const changedCount = diff.sections.filter(s => isChanged(s.status)).length
  const removedCount = diff.removed.length
  // A re-render of an identical plan has nothing to surface, so show no chrome at all.
  if (changedCount === 0 && removedCount === 0) return null

  const overlays = diffOverlays(sections, diff, onlyChanges)
  // The toggle only does something when the bars are mapped (the diff and DOM section counts agree).
  const mapped = sections.length === diff.sections.length

  return (
    <>
      {overlays.map(overlay =>
        overlay.kind === 'bar' ? (
          <div
            key={overlay.sectionIndex}
            className='vp-diff-bar'
            data-status={overlay.status}
            style={{
              top: overlay.rect.top,
              left: overlay.rect.left,
              height: overlay.rect.height,
              background: STATUS_COLOR[overlay.status],
            }}
          />
        ) : (
          // Fade an unchanged section so the changed ones stand out; an overlay scrim, never a DOM edit.
          <div
            key={overlay.sectionIndex}
            className='vp-diff-scrim'
            style={{ top: overlay.rect.top, left: 10, right: 10, height: overlay.rect.height }}
          />
        ),
      )}
      <div className='vp-diff-summary'>
        <IconGitCommit size={14} />
        <span>{summaryText(changedCount, removedCount)}</span>
        {mapped && changedCount > 0 && (
          <button
            type='button'
            className='vp-diff-toggle'
            data-active={onlyChanges}
            onClick={() => setOnlyChanges(value => !value)}
          >
            Only changes
          </button>
        )}
      </div>
    </>
  )
}

/** "3 changed since last view" plus removed count, pluralized; the chip's text. */
function summaryText(changed: number, removed: number): string {
  const parts: string[] = []
  if (changed > 0) parts.push(`${changed} changed`)
  if (removed > 0) parts.push(`${removed} removed`)
  return `${parts.join(', ')} since last view`
}
