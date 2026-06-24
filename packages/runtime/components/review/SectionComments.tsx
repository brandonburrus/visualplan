import { IconMessagePlus } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'

/** A major section the reviewer can comment on: a `Phase` or a top-level `## heading`. */
export interface HoveredSection {
  label: string
  rect: DOMRect
}

/** The hover-detect selector for a section's anchor element within the plan column. */
const SECTION_SELECTOR = '.vp-phase, h2'

/** Derive a human label the agent can map back to the MDX: a Phase's title or the heading's text. */
function sectionLabel(element: Element): string {
  if (element.classList.contains('vp-phase')) {
    return element.querySelector('.vp-phase__title')?.textContent?.trim() || 'Phase'
  }
  return element.textContent?.trim() || 'Section'
}

/** The nearest *top-level* section (a direct child of `.vp-main`) under the pointer, or null. */
function topLevelSection(target: EventTarget | null, main: Element): Element | null {
  if (!(target instanceof Element)) return null
  const section = target.closest(SECTION_SELECTOR)
  return section && section.parentElement === main ? section : null
}

/**
 * Track which major section the pointer is over, so a single comment button can follow it. Returns
 * the hovered section (with a live rect, recomputed on scroll/resize) and `keepAlive`, which the
 * button calls on hover so traveling from the section to the button does not dismiss it.
 */
export function useHoveredSection(active: boolean): {
  hovered: HoveredSection | null
  keepAlive: () => void
} {
  const [hovered, setHovered] = useState<HoveredSection | null>(null)
  const elementRef = useRef<Element | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!active) return
    const main = document.querySelector('.vp-main')
    if (!main) return

    const reposition = () => {
      if (elementRef.current) {
        setHovered({
          label: sectionLabel(elementRef.current),
          rect: elementRef.current.getBoundingClientRect(),
        })
      }
    }
    const onPointerMove = (event: PointerEvent) => {
      const section = topLevelSection(event.target, main)
      if (section) {
        clearTimeout(hideTimer.current)
        if (section !== elementRef.current) {
          elementRef.current = section
          reposition()
        }
      }
    }
    // Delay the dismiss so the pointer can cross the small gap to the button (which calls keepAlive).
    const onLeave = () => {
      hideTimer.current = setTimeout(() => {
        elementRef.current = null
        setHovered(null)
      }, 280)
    }

    document.addEventListener('pointermove', onPointerMove)
    main.addEventListener('pointerleave', onLeave)
    window.addEventListener('scroll', reposition, { passive: true })
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('pointermove', onPointerMove)
      main.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('scroll', reposition)
      window.removeEventListener('resize', reposition)
      clearTimeout(hideTimer.current)
    }
  }, [active])

  return { hovered, keepAlive: () => clearTimeout(hideTimer.current) }
}

/** The floating "comment on this section" button, pinned to the right of the hovered section. */
export function HoverCommentButton({
  section,
  onClick,
  onKeepAlive,
}: {
  section: HoveredSection
  onClick: () => void
  onKeepAlive: () => void
}) {
  // Right of the section's content column, aligned near its top; clamped into the viewport.
  const left = Math.min(section.rect.right + 8, window.innerWidth - 44)
  const top = Math.max(section.rect.top + 4, 8)
  return (
    <button
      type='button'
      className='vp-review-add'
      style={{ top, left }}
      onClick={onClick}
      onMouseEnter={onKeepAlive}
      aria-label={`Comment on "${section.label}"`}
      title={`Comment on "${section.label}"`}
    >
      <IconMessagePlus size={17} />
    </button>
  )
}
