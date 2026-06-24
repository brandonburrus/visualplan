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
  /** One per current section, in document order. `prev` is the baseline prose, present only on
   * `edited` sections, for word-level highlighting. */
  sections: { status: DiffStatus; label: string; type: string; prev?: string }[]
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
  barOffset = 18,
): DiffOverlay[] {
  if (sections.length !== diff.sections.length) return []
  const overlays: DiffOverlay[] = []
  sections.forEach((section, index) => {
    const status = diff.sections[index]?.status
    if (!status) return
    const { top, bottom } = sectionContent(section)
    const height = Math.max(bottom - top, 0)
    if (isChanged(status)) {
      // `barOffset` is the distance left of the content; the caller tightens it in review mode so the
      // bar hugs the content edge and leaves the outer gutter free for the comment badges.
      const left = Math.max(section.element.getBoundingClientRect().left - barOffset, 4)
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

/** Data-component containers whose rendered text is structured data, not authored prose. Their text
 * tokenizes differently from the MDX source (file paths split by separators, table cells, task
 * items), so they are excluded from the prose diff, matching the source-side `PROSE_OPAQUE_COMPONENTS`. */
const DATA_COMPONENT_SELECTOR =
  '.vp-filetree, .vp-chart, .vp-matrix-wrap, .vp-compare, .vp-checklist, .vp-stat, .vp-questions'

/** The sibling blocks a section owns: from its start element through `lastElement`, so prose in a
 * following sibling (a heading's intro paragraph) is included, not just the start element's subtree. */
export function sectionOwnedElements(section: Section): Element[] {
  const parent = section.element.parentElement
  if (!parent) return [section.element]
  const children = Array.from(parent.children)
  const start = children.indexOf(section.element)
  if (start < 0) return [section.element]
  const last = children.indexOf(section.lastElement)
  return children.slice(start, (last < 0 ? start : last) + 1)
}

/** One step of a word-level diff: text kept (`eq`), removed from the baseline (`del`), or added in
 * the current version (`ins`). */
export interface DiffOp {
  type: 'eq' | 'del' | 'ins'
  text: string
}

/** Raw whitespace-split words, keeping original case and punctuation for display. */
function words(text: string): string[] {
  return text.match(/\S+/g) ?? []
}

/**
 * Word-level diff of `prev` -> `current` via LCS, as an ordered op list (kept / deleted / inserted).
 * Comparison is case-insensitive so a capitalization change is not noise, but ops carry the original
 * words for display. Pure, so it is unit-testable.
 */
export function wordDiffOps(prev: string[], current: string[]): DiffOp[] {
  const n = prev.length
  const m = current.length
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i] as number[]
    const next = dp[i + 1] as number[]
    for (let j = m - 1; j >= 0; j--) {
      row[j] = same(prev[i] as string, current[j] as string)
        ? (next[j + 1] ?? 0) + 1
        : Math.max(next[j] ?? 0, row[j + 1] ?? 0)
    }
  }
  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    const row = dp[i] as number[]
    const next = dp[i + 1] as number[]
    if (same(prev[i] as string, current[j] as string)) {
      ops.push({ type: 'eq', text: current[j] as string })
      i++
      j++
    } else if ((next[j] ?? 0) >= (row[j + 1] ?? 0)) {
      ops.push({ type: 'del', text: prev[i] as string })
      i++
    } else {
      ops.push({ type: 'ins', text: current[j] as string })
      j++
    }
  }
  while (i < n) ops.push({ type: 'del', text: prev[i++] as string })
  while (j < m) ops.push({ type: 'ins', text: current[j++] as string })
  return ops
}

/** The prose paragraphs a section owns: `<p>` elements not inside a data component (whose text is
 * structured data, not authored prose). Deduped, in document order. */
function proseParagraphs(roots: Element[]): HTMLParagraphElement[] {
  const found = new Set<HTMLParagraphElement>()
  for (const root of roots) {
    const candidates: Element[] = root.matches('p') ? [root] : []
    candidates.push(...root.querySelectorAll('p'))
    for (const el of candidates) {
      if (!el.closest(DATA_COMPONENT_SELECTOR)) found.add(el as HTMLParagraphElement)
    }
  }
  return [...found]
}

/** Render a word-diff op list into a fragment: kept words as text, deletions struck through, and
 * insertions marked, each followed by a space. */
function renderDiff(ops: DiffOp[]): DocumentFragment {
  const fragment = document.createDocumentFragment()
  for (const op of ops) {
    if (op.type === 'eq') {
      fragment.append(`${op.text} `)
    } else {
      const mark = document.createElement(op.type === 'del' ? 'del' : 'ins')
      mark.className = op.type === 'del' ? 'vp-diff-del' : 'vp-diff-ins'
      mark.textContent = op.text
      fragment.append(mark, ' ')
    }
  }
  return fragment
}

/**
 * Show an edited section's word-level changes inline: diff its prose against the baseline
 * (`prevProse`) and re-render the section's first prose paragraph as the diff (deletions struck
 * through, insertions marked), collapsing any further prose paragraphs while active. Returns a
 * cleanup that restores the original DOM exactly. Mutates the plan DOM by necessity (a deletion is
 * not present in the rendered page), but only the prose, and reversibly.
 */
export function applyInlineWordDiff(roots: Element[], prevProse: string): () => void {
  const paragraphs = proseParagraphs(roots)
  const target = paragraphs[0]
  if (!target) return () => {}
  const current = words(paragraphs.map(p => p.textContent ?? '').join(' '))
  const ops = wordDiffOps(words(prevProse), current)
  // Nothing actually differs in the prose (e.g. only a title/attribute changed): leave it untouched.
  if (!ops.some(op => op.type !== 'eq')) return () => {}

  const originalTarget = Array.from(target.childNodes)
  const collapsed = paragraphs.slice(1).map(p => ({ p, display: p.style.display }))
  target.replaceChildren(renderDiff(ops))
  for (const { p } of collapsed) p.style.display = 'none'

  return () => {
    target.replaceChildren(...originalTarget)
    for (const { p, display } of collapsed) p.style.display = display
  }
}
