/**
 * Section-level diffing of a plan across iterations. Splits an MDX plan into the same ordered
 * sections the runtime's `collectSections` derives from the rendered DOM, then aligns two versions
 * to classify each current section as unchanged / edited / added (and lists removed ones).
 *
 * Isomorphic: pure mdast parsing, no fs/React/DOM, so it is safe in the browser bundle. The
 * load-bearing invariant is that this split and the runtime's DOM split produce the **same count and
 * order** of sections, so the runtime can map a status onto a DOM section by document-order index.
 * Labels are display-only (the removed-section summary); they need not match the DOM's labels.
 */
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMdx from 'remark-mdx'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

/** A diff status for a section present in the current plan. `removed` rides a separate list. */
export type SectionStatus = 'unchanged' | 'edited' | 'added'

/** One section of a single plan version, in document order. */
export interface PlanSection {
  /** Section kind: `h1`/`h2`/`h3`, `phase`, `callout`, `chart`, `filetree`, `matrix`, `compare`,
   * `checklist`, `stat`, `questions`, or `mermaid`. Mirrors the runtime's section-start set. */
  type: string
  /** Human label for the summary (heading/title text, or a friendly block name). */
  label: string
  /** Matching key: a titled section keys by `type:label` (stable under body edits); a titleless one
   * keys by `type:#contentHash` (identical content matches; an edit falls to the similarity pass). */
  key: string
  /** Whether the section carries an authored title/heading, which drives the matching strategy. */
  titled: boolean
  /** Normalized text of the section's span, for edit detection and rename similarity. */
  text: string
}

/** The diff of a current plan against a baseline. `sections` is one entry per current section in
 * document order (so it maps onto the runtime's DOM sections by index); `removed` lists baseline
 * sections with no current match, for the summary. */
export interface SectionDiff {
  sections: { status: SectionStatus; label: string; type: string }[]
  removed: { label: string; type: string }[]
}

/** Two unmatched same-type sections whose token overlap is at least this are treated as a rename
 * (an edit), not a remove + add. Calibrated by the Phase 5 simulation corpus; start permissive. */
export const RENAME_THRESHOLD = 0.5

/** The JSX block components that begin a section, mapped to their section type token. Mirrors the
 * runtime `SECTION_START_SELECTOR` (minus headings and mermaid, handled separately). */
const JSX_SECTION_TYPES: Record<string, string> = {
  Phase: 'phase',
  Callout: 'callout',
  FileTree: 'filetree',
  Chart: 'chart',
  Matrix: 'matrix',
  Compare: 'compare',
  Checklist: 'checklist',
  Stat: 'stat',
  Questions: 'questions',
}

interface MdastNode {
  type: string
  depth?: number
  lang?: string | null
  value?: string
  name?: string | null
  attributes?: { type: string; name?: string; value?: unknown }[]
  children?: MdastNode[]
}

interface StartDescriptor {
  type: string
  label: string
  titled: boolean
}

function parse(source: string): MdastNode {
  return unified()
    .use(remarkParse)
    .use(remarkFrontmatter)
    .use(remarkGfm)
    .use(remarkMdx)
    .parse(source) as unknown as MdastNode
}

/** The string value of a JSX attribute, or undefined for an absent / non-string (expression) one. */
function attr(node: MdastNode, name: string): string | undefined {
  const found = node.attributes?.find(a => a.type === 'mdxJsxAttribute' && a.name === name)
  return typeof found?.value === 'string' ? found.value : undefined
}

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

/** Collapse runs of whitespace and trim, so formatting-only changes are not read as edits. */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** The rendered text of a node (text/inlineCode leaves only), for deriving a heading/section label. */
function textContent(node: MdastNode): string {
  let out = ''
  if (typeof node.value === 'string' && (node.type === 'text' || node.type === 'inlineCode')) {
    out += node.value
  }
  if (node.children) for (const child of node.children) out += textContent(child)
  return out
}

/** All text of a section's span: node values plus JSX string-attribute values (so a title or a
 * callout type is part of the content fingerprint), recursively. Used for hashing and similarity. */
function spanText(node: MdastNode): string {
  let out = ''
  if (typeof node.value === 'string') out += ` ${node.value} `
  if (node.attributes) {
    for (const a of node.attributes) if (typeof a.value === 'string') out += ` ${a.value} `
  }
  if (node.children) for (const child of node.children) out += spanText(child)
  return out
}

/** FNV-1a 32-bit hash as hex; deterministic and dependency-free (no crypto needed for a cache key). */
function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

/** Describe a section-starting node, or null if the node does not begin a section. Only the section
 * START set matters here; following non-start siblings are folded into the preceding section. */
function startDescriptor(node: MdastNode): StartDescriptor | null {
  if (node.type === 'heading' && (node.depth ?? 0) <= 3) {
    return { type: `h${node.depth}`, label: normalizeWhitespace(textContent(node)), titled: true }
  }
  if (node.type === 'code' && node.lang === 'mermaid') {
    return { type: 'mermaid', label: 'Diagram', titled: false }
  }
  if (node.type === 'mdxJsxFlowElement' && node.name) {
    const sectionType = JSX_SECTION_TYPES[node.name]
    if (sectionType) return describeJsxSection(node, sectionType)
  }
  return null
}

function describeJsxSection(node: MdastNode, type: string): StartDescriptor {
  const titleAttr = (fallback: string): StartDescriptor => {
    const title = attr(node, 'title')
    return { type, label: title ?? fallback, titled: title !== undefined }
  }
  switch (type) {
    case 'phase':
      return titleAttr('Phase')
    case 'chart':
      return titleAttr('Chart')
    case 'checklist':
      return titleAttr('Checklist')
    case 'stat':
      return titleAttr('Stat')
    case 'questions':
      return titleAttr('Open questions')
    case 'callout': {
      // A callout has no title; its rendered label is the type word (Risk/Decision/...). It keys by
      // content (titleless) so two same-type callouts stay distinct and an edited body is a rename.
      const calloutType = attr(node, 'type')
      return { type, label: calloutType ? capitalize(calloutType) : 'Note', titled: false }
    }
    case 'filetree':
      return { type, label: 'File changes', titled: false }
    default:
      // matrix, compare, and any other titleless block.
      return { type, label: 'Comparison', titled: false }
  }
}

/**
 * Split a plan's MDX source into its ordered sections, mirroring the runtime's DOM section split:
 * each top-level heading (depth <= 3), mermaid fence, or block component begins a section that owns
 * the following non-start siblings up to the next start.
 */
export function splitSections(source: string): PlanSection[] {
  const children = parse(source).children ?? []
  const starts: { index: number; descriptor: StartDescriptor }[] = []
  children.forEach((node, index) => {
    const descriptor = startDescriptor(node)
    if (descriptor) starts.push({ index, descriptor })
  })

  return starts.map(({ index, descriptor }, position) => {
    const end = starts[position + 1]?.index ?? children.length
    const text = normalizeWhitespace(children.slice(index, end).map(spanText).join(' '))
    const { type, label, titled } = descriptor
    const key = titled ? `${type}:${label}` : `${type}:#${hash(text)}`
    return { type, label, key, titled, text }
  })
}

/** Tokenize into a lowercase word set for Jaccard similarity. */
function tokenSet(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
}

/** Token Jaccard similarity in [0, 1]; 1 when both are empty (two empty blocks are "the same"). */
function similarity(a: string, b: string): number {
  const setA = tokenSet(a)
  const setB = tokenSet(b)
  if (setA.size === 0 && setB.size === 0) return 1
  let intersection = 0
  for (const token of setA) if (setB.has(token)) intersection++
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

/** Longest common subsequence over two key arrays, returned as matched `[baseIndex, currentIndex]`
 * pairs in order. Duplicate keys are handled (it is a sequence alignment, not a set match). */
function lcsPairs(base: string[], current: string[]): [number, number][] {
  const n = base.length
  const m = current.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i] as number[]
    const nextRow = dp[i + 1] as number[]
    for (let j = m - 1; j >= 0; j--) {
      row[j] =
        base[i] === current[j]
          ? (nextRow[j + 1] ?? 0) + 1
          : Math.max(nextRow[j] ?? 0, row[j + 1] ?? 0)
    }
  }
  const pairs: [number, number][] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    const row = dp[i] as number[]
    const nextRow = dp[i + 1] as number[]
    if (base[i] === current[j]) {
      pairs.push([i, j])
      i++
      j++
    } else if ((nextRow[j] ?? 0) >= (row[j + 1] ?? 0)) {
      i++
    } else {
      j++
    }
  }
  return pairs
}

/**
 * Diff a current plan against a baseline at the section level. Aligns by key via LCS (so order is
 * respected and inserts/deletes are localized), marks key-matched pairs unchanged or edited by their
 * text, then runs a similarity pass over the leftovers so a reworded title or an edited titleless
 * block reads as an edit rather than a remove + add. Whatever stays unmatched is added / removed.
 */
export function diffSections(baseline: string, current: string): SectionDiff {
  const base = splitSections(baseline)
  const cur = splitSections(current)

  const baseMatched = new Array(base.length).fill(false)
  const curMatched = new Array(cur.length).fill(false)
  const status: (SectionStatus | undefined)[] = new Array(cur.length)

  for (const [bi, ci] of lcsPairs(
    base.map(s => s.key),
    cur.map(s => s.key),
  )) {
    baseMatched[bi] = true
    curMatched[ci] = true
    // A titleless key embeds the content hash, so a matched key implies identical text (unchanged);
    // a titled key is stable under body edits, so compare the text to tell unchanged from edited.
    status[ci] =
      (base[bi] as PlanSection).text === (cur[ci] as PlanSection).text ? 'unchanged' : 'edited'
  }

  // Rename / edit-of-titleless pass: pair each leftover current section with the most similar
  // leftover baseline section of the same type, above the threshold.
  for (let ci = 0; ci < cur.length; ci++) {
    if (curMatched[ci]) continue
    const target = cur[ci] as PlanSection
    let best = -1
    let bestScore = RENAME_THRESHOLD
    for (let bi = 0; bi < base.length; bi++) {
      const candidate = base[bi] as PlanSection
      if (baseMatched[bi] || candidate.type !== target.type) continue
      const score = similarity(candidate.text, target.text)
      if (score >= bestScore) {
        bestScore = score
        best = bi
      }
    }
    if (best >= 0) {
      baseMatched[best] = true
      curMatched[ci] = true
      status[ci] = 'edited'
    }
  }

  for (let ci = 0; ci < cur.length; ci++) {
    if (status[ci] === undefined) status[ci] = 'added'
  }

  const removed = base
    .filter((_, bi) => !baseMatched[bi])
    .map(s => ({ label: s.label, type: s.type }))

  return {
    sections: cur.map((s, ci) => ({
      status: status[ci] as SectionStatus,
      label: s.label,
      type: s.type,
    })),
    removed,
  }
}
