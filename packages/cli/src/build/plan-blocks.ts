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
] as const

/** The prop each block component receives its parsed data on (a JSON string at render). */
export const BLOCK_DATA_ATTR: Record<string, string> = {
  FileTree: 'files',
  Checklist: 'items',
  Questions: 'items',
  Chart: 'data',
  Compare: 'options',
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

interface MdNode {
  type: string
  value?: string
  depth?: number
  checked?: boolean | null
  children?: MdNode[]
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

function parseFileTree(node: MdNode): BlockResult {
  const issues: BlockIssue[] = []
  const files: Array<{ path: string; change: string }> = []
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
    // A move reads "move <from> -> <to>"; render the destination, where the file now lives.
    if (change === 'move' && path.includes('->')) path = (path.split('->').pop() ?? '').trim()
    if (!CHANGES.includes(change)) {
      issues.push({
        ...pos(item),
        message: `<FileTree> item "${text}" must start with a change: ${CHANGES.join(', ')}.`,
      })
    } else if (!path) {
      issues.push({ ...pos(item), message: `<FileTree> item "${text}" is missing a file path.` })
    }
    files.push({ path, change })
  }
  return { value: files, issues }
}

function parseChart(node: MdNode): BlockResult {
  const issues: BlockIssue[] = []
  const data: Array<{ label: string; value: unknown }> = []
  const list = firstList(node)
  if (!list) {
    issues.push({
      ...pos(node),
      message: '<Chart> needs a markdown list of "- <label>: <value>" items.',
    })
    return { value: data, issues }
  }
  for (const item of list.children ?? []) {
    const text = toText(item).trim()
    const colon = text.lastIndexOf(':')
    if (colon === -1) {
      issues.push({ ...pos(item), message: `<Chart> item "${text}" must be "label: number".` })
      // Keep the raw text as the value so the render-time zod number check also fails.
      data.push({ label: text, value: text })
      continue
    }
    const label = text.slice(0, colon).trim()
    const raw = text.slice(colon + 1).trim()
    const value = Number(raw)
    if (raw === '' || Number.isNaN(value)) {
      issues.push({ ...pos(item), message: `<Chart> item "${text}" has a non-numeric value.` })
      data.push({ label, value: raw })
      continue
    }
    data.push({ label, value })
  }
  return { value: data, issues }
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
