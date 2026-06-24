import { IconMessage2, IconMessagePlus } from '@tabler/icons-react'
import { Fragment, useEffect, useState } from 'react'

/** A section the reviewer can comment on: a `Phase`, a heading, or a standalone block. */
export interface Section {
  /** Document-order index, the stable key for comments (labels can repeat). */
  index: number
  label: string
  /** The section's anchor (the phase, heading, or block element). */
  element: Element
  /** The last top-level element this section owns (the one before the next section), so the
   * highlight can wrap the actual content rather than the empty space up to the next section. */
  lastElement: Element
}

/** What starts a commentable section: a phase, any heading, or a standalone block component. Only
 * direct children of `.vp-main` are tested, so a block nested inside a `<Phase>` stays part of that
 * phase; this splits up the loose top-level content (intro prose, a diagram, a callout) that would
 * otherwise collapse into one oversized first section. `.vp-matrix-wrap` is the Matrix's scroll
 * wrapper (its real top-level element). */
const SECTION_START_SELECTOR =
  '.vp-phase, h1, h2, h3, .vp-callout, .vp-mermaid, .vp-chart, .vp-filetree, .vp-matrix-wrap, .vp-compare, .vp-checklist, .vp-stat, .vp-questions'

/** Friendly labels for blocks with no heading text of their own, by the class that identifies each. */
const BLOCK_LABELS: ReadonlyArray<[string, string]> = [
  ['.vp-mermaid', 'Diagram'],
  ['.vp-filetree', 'File changes'],
  ['.vp-matrix-wrap', 'Comparison'],
  ['.vp-compare', 'Comparison'],
]

/** Derive a human label the agent can map back to the MDX: a Phase/heading's text, a block's own
 * title, a friendly block name, or a short snippet of its content as a last resort. */
function sectionLabel(element: Element): string {
  if (element.classList.contains('vp-phase')) {
    return element.querySelector('.vp-phase__title')?.textContent?.trim() || 'Phase'
  }
  if (/^H[1-6]$/.test(element.tagName)) {
    return element.textContent?.trim() || 'Section'
  }
  // A block that carries its own title/label reads best by that.
  const titled = element.querySelector(
    '.vp-callout__label, .vp-questions__title, .vp-checklist__title, .vp-stat__title, .vp-chart__title',
  )
  if (titled?.textContent?.trim()) return titled.textContent.trim()
  for (const [selector, label] of BLOCK_LABELS) {
    if (element.matches(selector)) return label
  }
  const text = element.textContent?.trim() ?? ''
  return text ? (text.length > 60 ? `${text.slice(0, 60).trim()}…` : text) : 'Section'
}

/** Enumerate the plan's sections in document order, each owning the elements up to the next
 * section. Called once: the plan is a frozen snapshot. */
export function collectSections(): Section[] {
  const main = document.querySelector('.vp-main')
  if (!main) return []
  const children = Array.from(main.children)
  const starts = children.filter(el => el.matches(SECTION_START_SELECTOR))
  return starts.map((element, index) => {
    const next = starts[index + 1]
    const nextIdx = next ? children.indexOf(next) : children.length
    const lastElement = children[nextIdx - 1] ?? element
    return { index, label: sectionLabel(element), element, lastElement }
  })
}

/** The viewport-relative bottom of the plan column, the lower bound of the last section's band. */
function mainBottom(): number {
  return document.querySelector('.vp-main')?.getBoundingClientRect().bottom ?? window.innerHeight
}

/**
 * The vertical band a section occupies: from its own top down to the next section's top (the last
 * runs to the column bottom). Hover is decided by which band the pointer's Y falls in, so the whole
 * section, heading and the content beneath it, is the target, and the highlight spans it edge to edge.
 */
export function sectionBand(
  sections: Section[],
  arrayPos: number,
): { top: number; bottom: number } {
  const current = sections[arrayPos]
  const top = current?.element.getBoundingClientRect().top ?? 0
  const next = sections[arrayPos + 1]
  return { top, bottom: next ? next.element.getBoundingClientRect().top : mainBottom() }
}

/** The rect wrapping a section's actual content (anchor top to its last owned element's bottom), so
 * the highlight hugs the content instead of the empty space running up to the next section. */
export function sectionContent(section: Section): { top: number; bottom: number } {
  return {
    top: section.element.getBoundingClientRect().top,
    bottom: section.lastElement.getBoundingClientRect().bottom,
  }
}

/** The section whose vertical band contains the viewport Y, or null (e.g. above the first section). */
export function sectionAt(sections: Section[], y: number): Section | null {
  for (let pos = 0; pos < sections.length; pos++) {
    const section = sections[pos]
    if (!section) continue
    const band = sectionBand(sections, pos)
    if (y >= band.top && y < band.bottom) return section
  }
  return null
}

/**
 * Track the plan's sections and which band the pointer is in. Collects sections once after mount,
 * then maps the pointer's Y to a section band, so hovering anywhere in a section (not just its
 * header) selects it, and the highlight is a stable full-width band rather than something chasing the
 * cursor. Re-runs on scroll with the last Y so the highlight follows the content, and bumps a tick so
 * the overlays (which read live rects) stay pinned.
 */
export function useReviewSections(active: boolean): {
  sections: Section[]
  hoveredIndex: number | null
} {
  const [sections, setSections] = useState<Section[]>([])
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => setSections(collectSections()), [])

  useEffect(() => {
    if (!active || sections.length === 0) {
      setHoveredIndex(null)
      return
    }
    let lastY = -1
    const detect = () => {
      if (lastY < 0) return
      setHoveredIndex(sectionAt(sections, lastY)?.index ?? null)
    }
    const onMove = (event: PointerEvent) => {
      lastY = event.clientY
      detect()
    }
    const onReflow = () => {
      setTick(tick => tick + 1)
      detect()
    }

    document.addEventListener('pointermove', onMove)
    window.addEventListener('scroll', onReflow, { passive: true })
    window.addEventListener('resize', onReflow)
    return () => {
      document.removeEventListener('pointermove', onMove)
      window.removeEventListener('scroll', onReflow)
      window.removeEventListener('resize', onReflow)
    }
  }, [active, sections])

  return { sections, hoveredIndex }
}

/** A finalized text selection inside the plan: the quoted text and a snapshot of its range. */
export interface TextSelection {
  text: string
  range: Range
}

/**
 * Surface a text selection made within the plan so the reviewer can comment on an exact quote. Reads
 * the selection on `mouseup`; ignores collapsed selections and any selection outside `.vp-main`. The
 * range is cloned so its rect can be read live (it tracks scroll); `clear` dismisses the affordance.
 */
export function useTextSelection(active: boolean): {
  selection: TextSelection | null
  clear: () => void
} {
  const [selection, setSelection] = useState<TextSelection | null>(null)

  useEffect(() => {
    if (!active) {
      setSelection(null)
      return
    }
    const main = document.querySelector('.vp-main')
    if (!main) return
    const onMouseUp = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelection(null)
        return
      }
      const range = sel.getRangeAt(0)
      const text = sel.toString().trim()
      if (!text || !main.contains(range.commonAncestorContainer)) {
        setSelection(null)
        return
      }
      setSelection({ text, range: range.cloneRange() })
    }
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [active])

  return { selection, clear: () => setSelection(null) }
}

/**
 * The per-section overlay layer: highlights the hovered section and shows its add-comment button, and
 * a persistent count badge on any section that already has comments. All fixed-position over the plan
 * (read from live rects), so the plan DOM is never touched.
 */
export function SectionOverlays({
  sections,
  hoveredIndex,
  commentCounts,
  onAdd,
  onView,
}: {
  sections: Section[]
  hoveredIndex: number | null
  commentCounts: Map<number, number>
  onAdd: (section: Section) => void
  onView: (section: Section) => void
}) {
  return (
    <>
      {sections.map(section => {
        const hovered = section.index === hoveredIndex
        const count = commentCounts.get(section.index) ?? 0
        if (!hovered && count === 0) return null
        const rect = section.element.getBoundingClientRect()
        const content = sectionContent(section)
        // Center the controls on the section's actual content, kept on-screen and clear of the
        // bottom bar when the content extends beyond the viewport (a tall section, or scrolled off).
        const controlTop = Math.min(
          Math.max((content.top + content.bottom) / 2 - 15, 8),
          window.innerHeight - 72,
        )
        return (
          <Fragment key={section.index}>
            {hovered && (
              // A wide band hugging the section's content (heading + its elements), not the empty
              // space up to the next section. Side-inset for breathing space; overlay only, so it
              // never shifts the page layout.
              <div
                className='vp-review-highlight'
                style={{
                  top: content.top,
                  left: 10,
                  right: 10,
                  height: Math.max(content.bottom - content.top, 0),
                }}
              />
            )}
            {hovered && (
              <button
                type='button'
                className='vp-review-add'
                // Out in the right gutter with breathing room from the content, clamped on-screen.
                style={{ top: controlTop, left: Math.min(rect.right + 18, window.innerWidth - 42) }}
                onClick={() => onAdd(section)}
                aria-label={`Comment on "${section.label}"`}
                title={`Comment on "${section.label}"`}
              >
                <IconMessagePlus size={16} />
              </button>
            )}
            {count > 0 && (
              <button
                type='button'
                className='vp-review-badge'
                // Out in the left gutter, past the diff gutter bar (which sits at rect.left - 18) so
                // the two never overlap; clamped on-screen.
                style={{ top: controlTop, left: Math.max(rect.left - 64, 8) }}
                onClick={() => onView(section)}
                aria-label={`${count} comment${count === 1 ? '' : 's'} on "${section.label}"`}
                title={`View ${count} comment${count === 1 ? '' : 's'}`}
              >
                <IconMessage2 size={13} />
                {count}
              </button>
            )}
          </Fragment>
        )
      })}
    </>
  )
}
