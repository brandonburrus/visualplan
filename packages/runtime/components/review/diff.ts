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

/** The CSS Custom Highlight registered for inserted/changed words inside an edited section. */
export const DIFF_HIGHLIGHT_NAME = 'vp-diff-ins'

interface HighlightRegistry {
  set(name: string, highlight: unknown): void
  delete(name: string): void
}

/** Register `ranges` as a non-destructive CSS Custom Highlight (no DOM mutation) and return a cleanup
 * that removes it. Where the Custom Highlight API is unavailable (older browsers) or there is nothing
 * to mark, it clears any prior highlight and degrades to no inline cue; the gutter bars still show. */
export function applyWordHighlights(ranges: Range[]): () => void {
  const registry = (CSS as unknown as { highlights?: HighlightRegistry }).highlights
  const HighlightConstructor = (
    globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }
  ).Highlight
  const clear = () => registry?.delete(DIFF_HIGHLIGHT_NAME)
  if (!registry || !HighlightConstructor || ranges.length === 0) {
    clear()
    return clear
  }
  registry.set(DIFF_HIGHLIGHT_NAME, new HighlightConstructor(...ranges))
  return clear
}

/** A prose word in the rendered section, with the text node and offsets that locate it for a Range. */
interface ProseToken {
  node: Text
  start: number
  end: number
  text: string
}

/** Lowercase word tokens, for whitespace-insensitive, case-insensitive matching. */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/\S+/g) ?? []
}

/** Collect the prose word tokens within a set of root elements: text inside `p`/`li` only (so
 * titles, headings, and chrome like a status badge are never matched), each tagged with its text
 * node + offsets. A section owns several sibling blocks (e.g. a heading plus its intro paragraph),
 * so the caller passes all of them, not just the start element. */
function proseTokens(roots: Element[]): ProseToken[] {
  const tokens: ProseToken[] = []
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      const block = node.parentElement?.closest('p, li')
      if (block && root.contains(block)) {
        const text = node.textContent ?? ''
        for (const match of text.matchAll(/\S+/g)) {
          if (match.index !== undefined) {
            tokens.push({
              node: node as Text,
              start: match.index,
              end: match.index + match[0].length,
              text: match[0],
            })
          }
        }
      }
      node = walker.nextNode()
    }
  }
  return tokens
}

/** The current-token indices NOT in the LCS with the previous tokens, i.e. the inserted/changed words. */
function insertedIndices(prev: string[], current: string[]): Set<number> {
  const n = prev.length
  const m = current.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i] as number[]
    const next = dp[i + 1] as number[]
    for (let j = m - 1; j >= 0; j--) {
      row[j] =
        prev[i] === current[j] ? (next[j + 1] ?? 0) + 1 : Math.max(next[j] ?? 0, row[j + 1] ?? 0)
    }
  }
  const matched = new Set<number>()
  let i = 0
  let j = 0
  while (i < n && j < m) {
    const row = dp[i] as number[]
    const next = dp[i + 1] as number[]
    if (prev[i] === current[j]) {
      matched.add(j)
      i++
      j++
    } else if ((next[j] ?? 0) >= (row[j + 1] ?? 0)) {
      i++
    } else {
      j++
    }
  }
  const inserted = new Set<number>()
  for (let k = 0; k < m; k++) if (!matched.has(k)) inserted.add(k)
  return inserted
}

/**
 * Ranges over the words in a section's prose that are new or changed relative to `prevProse` (the
 * baseline section's prose). `roots` are the sibling blocks the section owns (its start element plus
 * any following blocks up to the next section). A word-level LCS marks the inserted current tokens;
 * each becomes a DOM Range so the caller can register a non-destructive CSS Custom Highlight (no DOM
 * mutation). Pure given the DOM, so it is unit-testable in jsdom.
 */
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

export function insertedWordRanges(roots: Element[], prevProse: string): Range[] {
  const tokens = proseTokens(roots)
  if (tokens.length === 0) return []
  const inserted = insertedIndices(
    tokenize(prevProse),
    tokens.map(t => t.text.toLowerCase()),
  )
  const ranges: Range[] = []
  tokens.forEach((token, index) => {
    if (!inserted.has(index)) return
    const range = document.createRange()
    range.setStart(token.node, token.start)
    range.setEnd(token.node, token.end)
    ranges.push(range)
  })
  return ranges
}
