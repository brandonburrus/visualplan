import { IconGitCommit } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import {
  applyInlineWordDiff,
  type DiffStatus,
  diffOverlays,
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
  // The gutter bars are always on; "Show changes" reveals the inline word diffs and fades unchanged
  // sections to focus on the deltas.
  const [showChanges, setShowChanges] = useState(false)
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

  // Reveal the word-level changes inline only while "Show changes" is active: re-render each edited
  // section's prose as a diff, deletions struck through and insertions marked. The cleanup restores
  // the prose when the toggle goes off (or on unmount).
  useEffect(() => {
    if (!showChanges || sections.length !== diff.sections.length) return
    const restores = sections.flatMap((section, index) => {
      const entry = diff.sections[index]
      return entry?.status === 'edited' && entry.prev
        ? [applyInlineWordDiff(sectionOwnedElements(section), entry.prev)]
        : []
    })
    return () => {
      for (const restore of restores) restore()
    }
  }, [showChanges, sections, diff])

  const changedCount = diff.sections.filter(s => isChanged(s.status)).length
  const removedCount = diff.removed.length
  // A re-render of an identical plan has nothing to surface, so show no chrome at all.
  if (changedCount === 0 && removedCount === 0) return null

  const overlays = diffOverlays(sections, diff, showChanges)
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
            data-active={showChanges}
            onClick={() => setShowChanges(value => !value)}
          >
            Show changes
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
