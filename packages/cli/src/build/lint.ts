import { readFile } from 'node:fs/promises'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMdx from 'remark-mdx'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { parseBlockChildren } from '@visualplan/compile'
import type { CheckIssue } from './check.js'

/**
 * Author-time quality lint for plans, run by the `check` command alongside the syntax check. These
 * are not correctness errors: a flagged plan renders fine. They catch the "tell, don't show"
 * mistakes the visual-plan skill documents (a wall of prose, a wide left-to-right diagram, an
 * unreadable Matrix cell), so the agent gets the feedback before a human ever sees a weak render.
 * Every issue carries severity 'warn'; `check` still fails on them, so a weak plan blocks until fixed.
 *
 * The thresholds are deliberately collected at the top for calibration against an eval corpus of
 * good and weak plans: tune these numbers, not the rule logic, to move a rule's sensitivity.
 */

/** A Phase with more than this many characters of prose and no structural child reads as an essay.
 * Calibrated against an editorial corpus: ~470-char prose-only phases still read as tight intent,
 * ~560+ as a wall a reviewer would push back on. Good plans lead with a visual, so their phases
 * carry structure and never reach this rule whatever their length. */
const WALL_OF_PROSE_CHARS = 520
/** A left-to-right flowchart with more than this many edges shrinks to illegibility inline. */
const WIDE_MERMAID_EDGES = 6
/** A Matrix cell longer than this forces a horizontal scrollbar (cells do not wrap). */
const MATRIX_CELL_BUDGET = 32
/** A chart whose largest series outscales its smallest by more than this ratio flattens the small
 * series onto the shared y-axis. Compared per series, not across the category axis: a single series
 * growing along its categories (a ramp, a funnel) is the data's shape, not a charting mistake.
 * Held conservative on purpose: a legitimate multi-series ramp (allowed vs rejected across a 100x
 * traffic ramp) can have a ~40x peak spread, so a lower ratio would flag it. Catching 40-90x GROUPED
 * charts without also flagging stacked ramps needs stacked-awareness, not a lower ratio. */
const CHART_MAGNITUDE_RATIO = 100

/** The components that count as "showing structure" for the all-prose rule. A `Callout` is excluded
 * on purpose: a plan of nothing but callouts is still telling, not showing. */
const STRUCTURE_COMPONENTS = new Set([
  'Phase',
  'FileTree',
  'Chart',
  'Matrix',
  'Compare',
  'Checklist',
  'Stat',
  'Questions',
])

interface MdNode {
  type: string
  name?: string | null
  lang?: string | null
  value?: string
  children?: MdNode[]
  position?: { start: { line: number; column: number } }
}

/** Lint a plan file. Read separately from the syntax check; `check` only lints a plan that already
 * passes the syntax check, so the parse here never sees malformed MDX. */
export async function lintPlan(mdxPath: string): Promise<CheckIssue[]> {
  return lintSource(await readFile(mdxPath, 'utf8'))
}

/** Walk an mdast tree and emit the quality warnings for a (syntactically valid) plan source. */
export function lintSource(source: string): CheckIssue[] {
  const issues: CheckIssue[] = []
  const tree = unified()
    .use(remarkParse)
    .use(remarkFrontmatter)
    .use(remarkGfm)
    .use(remarkMdx)
    .parse(source) as unknown as MdNode

  let hasStructure = false
  walk(tree, node => {
    if (isStructural(node)) hasStructure = true
    if (node.type === 'mdxJsxFlowElement') {
      if (node.name === 'Phase') lintPhaseProse(node, issues)
      else if (node.name === 'Matrix') lintMatrixCells(node, issues)
      else if (node.name === 'FileTree') lintMoveComments(node, issues)
      else if (node.name === 'Chart') lintChartMagnitude(node, issues)
    } else if (node.type === 'code' && node.lang === 'mermaid') {
      lintWideMermaid(node, issues)
    }
  })

  // A plan with no diagram, timeline, or data component adds nothing over a wall of plain text.
  if (!hasStructure) {
    issues.push({
      line: 1,
      column: 1,
      severity: 'warn',
      message:
        'This plan is all prose: no diagram, Phase timeline, or data component. A visual plan should show its structure, or it adds nothing over plain text.',
    })
  }

  return issues
}

function isStructural(node: MdNode): boolean {
  if (node.type === 'code' && (node.lang === 'mermaid' || node.lang === 'math')) return true
  return node.type === 'mdxJsxFlowElement' && !!node.name && STRUCTURE_COMPONENTS.has(node.name)
}

/** A `Phase` that is a long run of prose with no diagram, list, or nested component: an essay where
 * the skill wants a line of intent then a visual. */
function lintPhaseProse(phase: MdNode, issues: CheckIssue[]): void {
  let structural = false
  let prose = 0
  for (const child of phase.children ?? []) {
    walk(child, node => {
      if (
        node.type === 'list' ||
        node.type === 'code' ||
        node.type === 'mdxJsxFlowElement' ||
        node.type === 'mdxJsxTextElement'
      ) {
        structural = true
      }
      if (node.type === 'text' && typeof node.value === 'string') prose += node.value.length
    })
  }
  if (!structural && prose > WALL_OF_PROSE_CHARS) {
    issues.push({
      ...at(phase),
      severity: 'warn',
      message: `This phase is ${prose} characters of prose with no diagram, list, or component. Lead with the visual and keep the prose to a line or two of intent.`,
    })
  }
}

/** A `flowchart LR` / `RL` past an edge count shrinks to illegibility inline; top-down or a split reads better. */
function lintWideMermaid(node: MdNode, issues: CheckIssue[]): void {
  const src = node.value ?? ''
  const firstLine = src
    .split('\n')
    .map(line => line.trim())
    .find(line => line.length > 0)
  if (!firstLine || !/^(flowchart|graph)\s+(LR|RL)\b/i.test(firstLine)) return
  const edges = (src.match(/-->|---|==>|===|-\.->|--[xo]\b|<-->/g) ?? []).length
  if (edges > WIDE_MERMAID_EDGES) {
    issues.push({
      ...at(node),
      severity: 'warn',
      message: `This left-to-right flowchart has ${edges} edges and will shrink to illegibility inline. Use \`flowchart TD\` or split it into smaller diagrams.`,
    })
  }
}

/** A `Matrix` cell longer than the budget forces a horizontal scrollbar, since cells do not wrap. */
function lintMatrixCells(node: MdNode, issues: CheckIssue[]): void {
  const value = parseBlockChildren('Matrix', node).value as {
    corner: string
    columns: { name: string }[]
    rows: { label: string; cells: string[] }[]
  } | null
  if (!value) return
  const cells = [
    value.corner,
    ...value.columns.map(column => column.name),
    ...value.rows.flatMap(row => [row.label, ...row.cells]),
  ]
  const longest = cells.reduce((widest, cell) => (cell.length > widest.length ? cell : widest), '')
  if (longest.length > MATRIX_CELL_BUDGET) {
    issues.push({
      ...at(node),
      severity: 'warn',
      message: `A Matrix cell is too long ("${truncate(longest)}", ${longest.length} chars). Cells do not wrap and force a horizontal scrollbar; keep them to a word or short score and put rationale in prose.`,
    })
  }
}

/** A `FileTree` move row with a `-- comment`: the origin annotation already fills the row, so the
 * comment gets crowded out. */
function lintMoveComments(node: MdNode, issues: CheckIssue[]): void {
  const list = (node.children ?? []).find(child => child.type === 'list')
  if (!list) return
  for (const item of list.children ?? []) {
    const text = toText(item).trim()
    if (/^move\b/.test(text) && text.includes(' -- ')) {
      issues.push({
        ...at(item),
        severity: 'warn',
        message:
          'This FileTree move row carries a "-- comment". The origin path already fills the row, so the comment gets crowded out; put it in prose or a Callout instead.',
      })
    }
  }
}

/** A multi-series `Chart` whose series differ wildly in scale flattens the small series onto the
 * shared y-axis. Compared per series (each series' peak), so a single series ramping along its
 * categories is never flagged: that spread is the data, not a mistake. */
function lintChartMagnitude(node: MdNode, issues: CheckIssue[]): void {
  const value = parseBlockChildren('Chart', node).value as {
    series: string[]
    data: { values: unknown[] }[]
  } | null
  if (!value || value.series.length < 2) return
  const peaks: number[] = []
  for (let index = 0; index < value.series.length; index++) {
    const numbers = value.data
      .map(point => point.values[index])
      .filter((candidate): candidate is number => typeof candidate === 'number' && candidate > 0)
    if (numbers.length > 0) peaks.push(Math.max(...numbers))
  }
  if (peaks.length < 2) return
  const max = Math.max(...peaks)
  const min = Math.min(...peaks)
  if (max / min > CHART_MAGNITUDE_RATIO) {
    issues.push({
      ...at(node),
      severity: 'warn',
      message: `This chart's series differ wildly in scale (a series peaking at ${min} alongside one at ${max}); the small series flattens onto the shared axis. Split into separate charts or normalize to one unit.`,
    })
  }
}

/** Depth-first walk over the mdast, visiting each node once. Own walker (not unist-util-visit) to
 * stay free of its node typing and reuse it cleanly for per-section subtrees. */
function walk(node: MdNode, visit: (node: MdNode) => void): void {
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}

/** Concatenate the text of an mdast node, ignoring formatting (mirrors the compile parser's helper). */
function toText(node: MdNode): string {
  if (typeof node.value === 'string') return node.value
  return (node.children ?? []).map(toText).join('')
}

function at(node: MdNode): { line: number; column: number } {
  return node.position?.start ?? { line: 1, column: 1 }
}

function truncate(text: string, max = 40): string {
  return text.length > max ? `${text.slice(0, max).trim()}…` : text
}
