// @vitest-environment node
import remarkGfm from 'remark-gfm'
import remarkMdx from 'remark-mdx'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { describe, expect, it } from 'vitest'
import { type BlockResult, parseBlockChildren } from '../src/build/plan-blocks.js'

/** Parse a plan block authored as markdown children and return its parsed result. */
function parseBlock(name: string, source: string): BlockResult {
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMdx).parse(source)
  let node: unknown
  visit(tree, 'mdxJsxFlowElement', (found: { name?: string | null }) => {
    if (found.name === name) node = found
  })
  if (!node) throw new Error(`no <${name}> element parsed from source`)
  return parseBlockChildren(name, node)
}

describe('FileTree block', () => {
  it('parses "- <change> <path>" bullets into file entries (golden)', () => {
    const { value, issues } = parseBlock(
      'FileTree',
      '<FileTree>\n- add src/a.ts\n- modify src/b.ts\n- delete src/c.ts\n</FileTree>\n',
    )
    expect(issues).toEqual([])
    expect(value).toEqual([
      { path: 'src/a.ts', change: 'add' },
      { path: 'src/b.ts', change: 'modify' },
      { path: 'src/c.ts', change: 'delete' },
    ])
  })

  it('flags an unknown change verb with its line (error)', () => {
    const { issues } = parseBlock('FileTree', '<FileTree>\n- frobnicate src/a.ts\n</FileTree>\n')
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toMatch(/must start with a change: add, modify, delete, move/)
    expect(issues[0]?.line).toBe(2)
  })

  it('renders a move at its destination, keeping the origin (golden)', () => {
    const move = parseBlock(
      'FileTree',
      '<FileTree>\n- move src/old.ts -> src/new.ts\n</FileTree>\n',
    )
    expect(move.value).toEqual([{ path: 'src/new.ts', change: 'move', from: 'src/old.ts' }])
    expect(move.issues).toEqual([])
  })

  it('flags a move with no "->" destination (error)', () => {
    const { value, issues } = parseBlock('FileTree', '<FileTree>\n- move src/old.ts\n</FileTree>\n')
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toMatch(/needs a destination: "- move <from> -> <to>"/)
    expect(issues[0]?.line).toBe(2)
    // No origin is captured, and the bare path is kept so the entry still renders.
    expect(value).toEqual([{ path: 'src/old.ts', change: 'move' }])
  })

  it('flags an empty tree with no list (edge)', () => {
    const empty = parseBlock('FileTree', '<FileTree>\nno list here\n</FileTree>\n')
    expect(empty.issues).toHaveLength(1)
    expect(empty.issues[0]?.message).toMatch(/needs a markdown list/)
  })

  it('keeps a trailing-slash directory path with no missing-path issue (edge)', () => {
    const { value, issues } = parseBlock(
      'FileTree',
      '<FileTree>\n- delete src/legacy/\n</FileTree>\n',
    )
    expect(issues).toEqual([])
    expect(value).toEqual([{ path: 'src/legacy/', change: 'delete' }])
  })
})

describe('Chart block', () => {
  it('parses a "- <label>: <value>" list into one series (golden)', () => {
    const { value, issues } = parseBlock(
      'Chart',
      '<Chart type="bar">\n- API: 3\n- UI: 2\n</Chart>\n',
    )
    expect(issues).toEqual([])
    expect(value).toEqual({
      series: ['value'],
      data: [
        { label: 'API', values: [3] },
        { label: 'UI', values: [2] },
      ],
    })
  })

  it('flags a non-numeric value (error)', () => {
    const { value, issues } = parseBlock('Chart', '<Chart type="bar">\n- API: lots\n</Chart>\n')
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toMatch(/is not a number/)
    // The raw value is kept (not a number) so render-time zod also rejects it.
    expect(value).toEqual({ series: ['value'], data: [{ label: 'API', values: ['lots'] }] })
  })

  it('splits on the last colon so labels may contain one (edge)', () => {
    const { value } = parseBlock('Chart', '<Chart type="line">\n- p95: latency: 120\n</Chart>\n')
    expect(value).toEqual({ series: ['value'], data: [{ label: 'p95: latency', values: [120] }] })
  })

  it('parses a table into multiple series (golden)', () => {
    const { value, issues } = parseBlock(
      'Chart',
      '<Chart type="bar">\n| Stage | p50 | p95 |\n|---|---|---|\n| Auth | 12 | 30 |\n| DB | 40 | 120 |\n</Chart>\n',
    )
    expect(issues).toEqual([])
    expect(value).toEqual({
      series: ['p50', 'p95'],
      data: [
        { label: 'Auth', values: [12, 30] },
        { label: 'DB', values: [40, 120] },
      ],
    })
  })

  it('rejects a multi-series pie (error)', () => {
    const { issues } = parseBlock(
      'Chart',
      '<Chart type="pie">\n| Stage | p50 | p95 |\n|---|---|---|\n| Auth | 12 | 30 |\n</Chart>\n',
    )
    expect(issues.some(issue => /single series/.test(issue.message))).toBe(true)
  })
})

describe('Matrix block', () => {
  it('parses a table into corner/columns/rows and marks the pick (golden)', () => {
    const { value, issues } = parseBlock(
      'Matrix',
      '<Matrix>\n| Dimension | Postgres (pick) | DynamoDB |\n|---|---|---|\n| Writes | medium | high |\n| Cost | low | low |\n</Matrix>\n',
    )
    expect(issues).toEqual([])
    expect(value).toEqual({
      corner: 'Dimension',
      columns: [{ name: 'Postgres', pick: true }, { name: 'DynamoDB' }],
      rows: [
        { label: 'Writes', cells: ['medium', 'high'] },
        { label: 'Cost', cells: ['low', 'low'] },
      ],
    })
  })

  it('flags a single-column matrix (error)', () => {
    const { issues } = parseBlock(
      'Matrix',
      '<Matrix>\n| Dimension | Only |\n|---|---|\n| Writes | medium |\n</Matrix>\n',
    )
    expect(issues.some(issue => /at least two value columns/.test(issue.message))).toBe(true)
  })

  it('flags a non-table body (edge)', () => {
    const { issues } = parseBlock('Matrix', '<Matrix>\njust prose, no table\n</Matrix>\n')
    expect(issues.some(issue => /needs a markdown table/.test(issue.message))).toBe(true)
  })
})

describe('Checklist block', () => {
  it('parses a GFM task list into done/todo items (golden)', () => {
    const { value, issues } = parseBlock(
      'Checklist',
      '<Checklist title="Done when">\n- [x] one\n- [ ] two\n</Checklist>\n',
    )
    expect(issues).toEqual([])
    expect(value).toEqual([
      { text: 'one', done: true },
      { text: 'two', done: false },
    ])
  })

  it('treats a plain bullet (no checkbox) as not done (edge)', () => {
    const { value } = parseBlock('Checklist', '<Checklist>\n- plain item\n</Checklist>\n')
    expect(value).toEqual([{ text: 'plain item', done: false }])
  })
})

describe('Questions block', () => {
  it('parses bullets into question strings (golden)', () => {
    const { value, issues } = parseBlock(
      'Questions',
      '<Questions>\n- First?\n- Second?\n</Questions>\n',
    )
    expect(issues).toEqual([])
    expect(value).toEqual(['First?', 'Second?'])
  })
})

describe('Compare block', () => {
  it('parses headings + pro/con bullets and marks the pick (golden)', () => {
    const { value, issues } = parseBlock(
      'Compare',
      '<Compare>\n## Redis (pick)\n- pro: accurate\n- con: hop\n\n## Memory\n- pro: fast\n</Compare>\n',
    )
    expect(issues).toEqual([])
    expect(value).toEqual([
      { name: 'Redis', pros: ['accurate'], cons: ['hop'], pick: true },
      { name: 'Memory', pros: ['fast'], cons: [] },
    ])
  })

  it('flags a bullet missing the pro:/con: prefix (error)', () => {
    const { issues } = parseBlock(
      'Compare',
      '<Compare>\n## A\n- accurate\n\n## B\n- pro: fast\n</Compare>\n',
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toMatch(/must start with "pro:" or "con:"/)
  })

  it('flags bullets that precede any option heading (edge)', () => {
    const { issues } = parseBlock('Compare', '<Compare>\n- pro: orphan\n</Compare>\n')
    expect(issues.some(issue => /must follow an option heading/.test(issue.message))).toBe(true)
  })
})
