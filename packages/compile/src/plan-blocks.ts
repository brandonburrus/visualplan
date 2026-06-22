import { CHANGE_VALUES } from '@visualplan/core'

/**
 * Parses the markdown-list children of the list-shaped plan components into the
 * structured data their zod schemas expect. Authors write these blocks as plain
 * markdown (bullets, GFM task lists, headings) instead of inline JS-object props,
 * so this is the one place that translates that markdown into props.
 *
 * Shared by two callers: `remark-plan-blocks` (the render pipeline, which uses
 * `value`) and `check` (which uses `issues` to report malformed items as
 * `file:line:col`). Both walk the same mdast, so they agree on what is valid.
 */

/** Components whose data is authored as markdown children rather than props. */
export const CHILD_BLOCK_COMPONENTS = [
  'FileTree',
  'Checklist',
  'Questions',
  'Chart',
  'Compare',
  'Matrix',
] as const

/** The prop each block component receives its parsed data on (a JSON string at render). */
export const BLOCK_DATA_ATTR: Record<string, string> = {
  FileTree: 'files',
  Checklist: 'items',
  Questions: 'items',
  Chart: 'data',
  Compare: 'options',
  Matrix: 'data',
}

export interface BlockIssue {
  line: number
  column: number
  message: string
}

export interface BlockResult {
  value: unknown
  issues: BlockIssue[]
}

interface MdAttribute {
  type: string
  name?: string
  value?: unknown
}

interface MdNode {
  type: string
  value?: string
  depth?: number
  checked?: boolean | null
  children?: MdNode[]
  attributes?: MdAttribute[]
  position?: { start: { line: number; column: number } }
}

const CHANGES: readonly string[] = CHANGE_VALUES

function pos(node: MdNode): { line: number; column: number } {
  return node.position?.start ?? { line: 1, column: 1 }
}

/** Concatenate the text of an mdast node, including inline code, ignoring formatting. */
function toText(node: MdNode): string {
  if (typeof node.value === 'string') return node.value
  return (node.children ?? []).map(toText).join('')
}

function firstList(node: MdNode): MdNode | undefined {
  return (node.children ?? []).find(child => child.type === 'list')
}

function firstTable(node: MdNode): MdNode | undefined {
  return (node.children ?? []).find(child => child.type === 'table')
}

/** Read a string-literal JSX attribute (e.g. Chart's `type`) off the element node. */
function attrValue(node: MdNode, name: string): string | undefined {
  const found = (node.attributes ?? []).find(a => a.type === 'mdxJsxAttribute' && a.name === name)
  return typeof found?.value === 'string' ? found.value : undefined
}

/** The cells of an mdast table row, as trimmed text. */
function rowCells(row: MdNode): string[] {
  return (row.children ?? []).map(cell => toText(cell).trim())
}

function parseFileTree(node: MdNode): BlockResult {
  const issues: BlockIssue[] = []
  const files: Array<{ path: string; change: string; from?: string }> = []
  const list = firstList(node)
  if (!list) {
    issues.push({
      ...pos(node),
      message: '<FileTree> needs a markdown list of "- <change> <path>" items.',
    })
    return { value: files, issues }
  }
  for (const item of list.children ?? []) {
    const text = toText(item).trim()
    const space = text.indexOf(' ')
    const change = space === -1 ? text : text.slice(0, space)
    let path = space === -1 ? '' : text.slice(space + 1).trim()
    let from: string | undefined
    // A move reads "move <from> -> <to>": keep the origin so the reader sees the rename, and
    // place the entry at its destination, where the file now lives. A move with no "->" arrow
    // would silently lose its destination, so flag it rather than render a meaningless marker.
    if (change === 'move') {
      if (path.includes('->')) {
        const [source, destination] = path.split('->')
        from = (source ?? '').trim()
        path = (destination ?? '').trim()
      } else if (path) {
        issues.push({
          ...pos(item),
          message: `<FileTree> move "${text}" needs a destination: "- move <from> -> <to>".`,
        })
      }
    }
    if (!CHANGES.includes(change)) {
      issues.push({
        ...pos(item),
        message: `<FileTree> item "${text}" must start with a change: ${CHANGES.join(', ')}.`,
      })
    } else if (!path) {
      issues.push({ ...pos(item), message: `<FileTree> item "${text}" is missing a file path.` })
    }
    files.push(from ? { path, change, from } : { path, change })
  }
  return { value: files, issues }
}

/** Parse "label: value" / cell text into a number, recording an issue (and keeping the raw
 * string so render-time zod also rejects it) when it is not numeric. */
function toNumber(raw: string, label: string, at: MdNode, issues: BlockIssue[]): number | string {
  const value = Number(raw)
  if (raw === '' || Number.isNaN(value)) {
    issues.push({ ...pos(at), message: `<Chart> value "${raw}" for "${label}" is not a number.` })
    return raw
  }
  return value
}

/** Chart types that visualize one value per category; a multi-series table is an authoring error. */
const SINGLE_SERIES_CHARTS: readonly string[] = ['pie', 'gauge', 'funnel', 'treemap']

function parseChart(node: MdNode): BlockResult {
  const issues: BlockIssue[] = []
  const data: Array<{ label: string; values: unknown[] }> = []
  const type = attrValue(node, 'type')

  // Table form = multiple series: header is "category | series1 | series2 ...".
  const table = firstTable(node)
  if (table) {
    const rows = table.children ?? []
    const series = rowCells(rows[0] ?? { type: 'tableRow' }).slice(1)
    for (const row of rows.slice(1)) {
      const cells = rowCells(row)
      const label = cells[0] ?? ''
      const values = series.map((_, i) => toNumber(cells[i + 1] ?? '', label, row, issues))
      data.push({ label, values })
    }
    if (type && SINGLE_SERIES_CHARTS.includes(type) && series.length > 1) {
      issues.push({
        ...pos(node),
        message: `<Chart type="${type}"> shows a single series; use a "- label: value" list.`,
      })
    }
    // Scatter plots x against y, so a table must carry exactly two value columns.
    if (type === 'scatter' && series.length !== 2) {
      issues.push({
        ...pos(node),
        message: '<Chart type="scatter"> needs exactly two value columns (x, y).',
      })
    }
    return { value: { series, data }, issues }
  }

  // Scatter has no single-series list form: it always needs an x/y table.
  if (type === 'scatter') {
    issues.push({
      ...pos(node),
      message: '<Chart type="scatter"> needs a table with x and y columns.',
    })
    return { value: { series: ['value'], data }, issues }
  }

  // List form = a single series of "- label: value".
  const list = firstList(node)
  if (!list) {
    issues.push({
      ...pos(node),
      message: '<Chart> needs a markdown list ("- label: value") or a table for multiple series.',
    })
    return { value: { series: ['value'], data }, issues }
  }
  for (const item of list.children ?? []) {
    const text = toText(item).trim()
    const colon = text.lastIndexOf(':')
    if (colon === -1) {
      issues.push({ ...pos(item), message: `<Chart> item "${text}" must be "label: number".` })
      data.push({ label: text, values: [text] })
      continue
    }
    const label = text.slice(0, colon).trim()
    data.push({ label, values: [toNumber(text.slice(colon + 1).trim(), label, item, issues)] })
  }
  return { value: { series: ['value'], data }, issues }
}

function parseMatrix(node: MdNode): BlockResult {
  const issues: BlockIssue[] = []
  const table = firstTable(node)
  if (!table) {
    issues.push({
      ...pos(node),
      message: '<Matrix> needs a markdown table (a header row plus at least one row).',
    })
    return { value: { corner: '', columns: [], rows: [] }, issues }
  }
  const trows = table.children ?? []
  const header = rowCells(trows[0] ?? { type: 'tableRow' })
  const corner = header[0] ?? ''
  const columns = header.slice(1).map(name => {
    const pick = /\(pick\)\s*$/i.test(name)
    const clean = pick ? name.replace(/\(pick\)\s*$/i, '').trim() : name
    return pick ? { name: clean, pick: true } : { name: clean }
  })
  if (columns.length < 2) {
    issues.push({
      ...pos(node),
      message: '<Matrix> needs at least two value columns after the row-label column.',
    })
  }
  if (trows.length < 2) {
    issues.push({ ...pos(node), message: '<Matrix> needs at least one row under the header.' })
  }
  const rows = trows.slice(1).map(row => {
    const cells = rowCells(row)
    return { label: cells[0] ?? '', cells: cells.slice(1) }
  })
  return { value: { corner, columns, rows }, issues }
}

function parseChecklist(node: MdNode): BlockResult {
  const issues: BlockIssue[] = []
  const items: Array<{ text: string; done: boolean }> = []
  const list = firstList(node)
  if (!list) {
    issues.push({
      ...pos(node),
      message: '<Checklist> needs a markdown task list ("- [x] done", "- [ ] todo").',
    })
    return { value: items, issues }
  }
  for (const item of list.children ?? []) {
    items.push({ text: toText(item).trim(), done: item.checked === true })
  }
  return { value: items, issues }
}

function parseQuestions(node: MdNode): BlockResult {
  const issues: BlockIssue[] = []
  const items: string[] = []
  const list = firstList(node)
  if (!list) {
    issues.push({ ...pos(node), message: '<Questions> needs a markdown list of questions.' })
    return { value: items, issues }
  }
  for (const item of list.children ?? []) items.push(toText(item).trim())
  return { value: items, issues }
}

function parseCompare(node: MdNode): BlockResult {
  const issues: BlockIssue[] = []
  const options: Array<{ name: string; pros: string[]; cons: string[]; pick?: boolean }> = []
  let current: { name: string; pros: string[]; cons: string[]; pick?: boolean } | undefined
  for (const child of node.children ?? []) {
    if (child.type === 'heading') {
      let name = toText(child).trim()
      const pick = /\(pick\)\s*$/i.test(name)
      if (pick) name = name.replace(/\(pick\)\s*$/i, '').trim()
      current = { name, pros: [], cons: [], ...(pick ? { pick: true } : {}) }
      options.push(current)
    } else if (child.type === 'list') {
      if (!current) {
        issues.push({
          ...pos(child),
          message: '<Compare> bullets must follow an option heading ("## Name").',
        })
        continue
      }
      for (const item of child.children ?? []) {
        const text = toText(item).trim()
        const colon = text.indexOf(':')
        const kind = colon === -1 ? '' : text.slice(0, colon).trim().toLowerCase()
        const detail = colon === -1 ? text : text.slice(colon + 1).trim()
        if (kind === 'pro') current.pros.push(detail)
        else if (kind === 'con') current.cons.push(detail)
        else
          issues.push({
            ...pos(item),
            message: `<Compare> item "${text}" must start with "pro:" or "con:".`,
          })
      }
    }
  }
  if (options.length === 0) {
    issues.push({
      ...pos(node),
      message: '<Compare> needs at least two option headings ("## Name").',
    })
  }
  return { value: options, issues }
}

const PARSERS: Record<string, (node: MdNode) => BlockResult> = {
  FileTree: parseFileTree,
  Checklist: parseChecklist,
  Questions: parseQuestions,
  Chart: parseChart,
  Compare: parseCompare,
  Matrix: parseMatrix,
}

/**
 * Translate one block component's markdown children into its structured props.
 * `value` is the props object the component validates with zod; `issues` are
 * positioned messages for malformed items, surfaced by `check`.
 */
export function parseBlockChildren(name: string, node: unknown): BlockResult {
  const parser = PARSERS[name]
  if (!parser) return { value: null, issues: [] }
  return parser(node as MdNode)
}
