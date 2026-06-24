/**
 * Reads the section diff the CLI injects as `globalThis.__VP_DIFF__` when a render has a baseline
 * (the snapshot cache or an explicit `--diff`). The shape mirrors `@visualplan/compile`'s
 * `SectionDiff`: one entry per CURRENT section in document order (so it maps onto the runtime's
 * `collectSections()` output by index), plus the baseline sections that were removed.
 *
 * The runtime redefines the type rather than importing `@visualplan/compile` (a Node-side build
 * dependency the browser bundle does not carry); the two must stay in sync by shape.
 */

import { type Section, sectionContent } from './SectionComments.js'

/** A diff status for a section present in the current plan. */
export type DiffStatus = 'unchanged' | 'edited' | 'added'

/** The diff payload injected by the CLI build's `planDiffPlugin`. */
export interface InjectedDiff {
  /** One per current section, in document order. */
  sections: { status: DiffStatus; label: string; type: string }[]
  /** Baseline sections with no current match. */
  removed: { label: string; type: string }[]
}

/** The injected diff, or null on a plain render with no baseline (the common case). */
export function readDiff(): InjectedDiff | null {
  const value = (globalThis as { __VP_DIFF__?: InjectedDiff }).__VP_DIFF__
  return value && Array.isArray(value.sections) ? value : null
}

/** Whether a status is a visible change (added or edited); unchanged sections get no cue. */
export function isChanged(status: DiffStatus): boolean {
  return status === 'added' || status === 'edited'
}

/** One positioned diff overlay: a gutter `bar` on a changed section, or a `scrim` fading an unchanged
 * one (only when `only changes` is on). The component turns each into a fixed-position element. */
export interface DiffOverlay {
  sectionIndex: number
  kind: 'bar' | 'scrim'
  status: DiffStatus
  rect: { top: number; left: number; height: number }
}

/**
 * Map the injected diff onto the DOM sections by document-order index. The diff is one entry per
 * current section in order, so index alignment is correct ONLY when the counts agree; if they drift
 * (the mdast split and the DOM split disagreed) the mapping is unsafe, so return no overlays rather
 * than risk marking the wrong section. A pure function over the section list, so it is unit-testable.
 */
export function diffOverlays(
  sections: Section[],
  diff: InjectedDiff,
  onlyChanges: boolean,
): DiffOverlay[] {
  if (sections.length !== diff.sections.length) return []
  const overlays: DiffOverlay[] = []
  sections.forEach((section, index) => {
    const status = diff.sections[index]?.status
    if (!status) return
    const { top, bottom } = sectionContent(section)
    const height = Math.max(bottom - top, 0)
    if (isChanged(status)) {
      const left = Math.max(section.element.getBoundingClientRect().left - 18, 6)
      overlays.push({
        sectionIndex: section.index,
        kind: 'bar',
        status,
        rect: { top, left, height },
      })
    } else if (onlyChanges) {
      overlays.push({
        sectionIndex: section.index,
        kind: 'scrim',
        status,
        rect: { top, left: 10, height },
      })
    }
  })
  return overlays
}
