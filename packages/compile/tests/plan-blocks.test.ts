// @vitest-environment node
import remarkGfm from 'remark-gfm'
import remarkMdx from 'remark-mdx'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { describe, expect, it } from 'vitest'
import { type BlockResult, parseBlockChildren } from '../src/plan-blocks.js'

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

  it('splits a " -- " trailer into an inline comment (golden)', () => {
    const { value, issues } = parseBlock(
      'FileTree',
      '<FileTree>\n- modify src/b.ts -- tighten validation\n</FileTree>\n',
    )
    expect(issues).toEqual([])
    expect(value).toEqual([{ path: 'src/b.ts', change: 'modify', comment: 'tighten validation' }])
  })

  it('keeps a comment on a move and never reads its "->" as the arrow (edge)', () => {
    const { value, issues } = parseBlock(
      'FileTree',
      '<FileTree>\n- move src/old.ts -> src/new.ts -- renamed; old -> new\n</FileTree>\n',
    )
    expect(issues).toEqual([])
    expect(value).toEqual([
      { path: 'src/new.ts', change: 'move', from: 'src/old.ts', comment: 'renamed; old -> new' },
    ])
  })

  it('drops an empty comment after a dangling " -- " (edge)', () => {
    const { value, issues } = parseBlock(
      'FileTree',
      '<FileTree>\n- add src/a.ts -- \n</FileTree>\n',
    )
    expect(issues).toEqual([])
    expect(value).toEqual([{ path: 'src/a.ts', change: 'add' }])
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

  it('rejects a multi-series gauge (error)', () => {
    const { issues } = parseBlock(
      'Chart',
      '<Chart type="gauge">\n| Stage | p50 | p95 |\n|---|---|---|\n| Auth | 12 | 30 |\n</Chart>\n',
    )
    expect(issues.some(issue => /single series/.test(issue.message))).toBe(true)
  })

  it('rejects a scatter list-form (error)', () => {
    const { issues } = parseBlock('Chart', '<Chart type="scatter">\n- API: 3\n- UI: 2\n</Chart>\n')
    expect(issues.some(issue => /needs a table with x and y columns/.test(issue.message))).toBe(
      true,
    )
  })

  it('rejects a scatter table without exactly two value columns (error)', () => {
    const { issues } = parseBlock(
      'Chart',
      '<Chart type="scatter">\n| Point | x | y | z |\n|---|---|---|---|\n| A | 1 | 2 | 3 |\n</Chart>\n',
    )
    expect(
      issues.some(issue => /needs exactly two value columns \(x, y\)/.test(issue.message)),
    ).toBe(true)
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

  it('parses nested bullets under a question into its options (golden)', () => {
    const { value, issues } = parseBlock(
      'Questions',
      '<Questions>\n- Rotate refresh tokens?\n  - Yes, every use\n  - Only after 24h\n</Questions>\n',
    )
    expect(issues).toEqual([])
    expect(value).toEqual([
      { text: 'Rotate refresh tokens?', options: ['Yes, every use', 'Only after 24h'] },
    ])
  })

  it('mixes option questions with plain free-text questions (golden)', () => {
    const { value, issues } = parseBlock(
      'Questions',
      '<Questions>\n- Rotate refresh tokens?\n  - Yes\n  - No\n- Is a 15-minute TTL acceptable?\n</Questions>\n',
    )
    expect(issues).toEqual([])
    expect(value).toEqual([
      { text: 'Rotate refresh tokens?', options: ['Yes', 'No'] },
      'Is a 15-minute TTL acceptable?',
    ])
  })

  it('flags an empty option with its line (error)', () => {
    const { issues } = parseBlock(
      'Questions',
      '<Questions>\n- Rotate refresh tokens?\n  - Yes\n  -\n</Questions>\n',
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toMatch(/option .* must not be empty/)
    expect(issues[0]?.line).toBe(4)
  })

  it('flags a list nested inside an option with its line (error)', () => {
    const { value, issues } = parseBlock(
      'Questions',
      '<Questions>\n- Rotate refresh tokens?\n  - Yes\n    - way too deep\n</Questions>\n',
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toMatch(/one level deep/)
    expect(issues[0]?.line).toBe(3)
    // The option keeps its own text; the too-deep list is not folded into it.
    expect(value).toEqual([{ text: 'Rotate refresh tokens?', options: ['Yes'] }])
  })

  it('flags a block with no list (edge)', () => {
    const { issues } = parseBlock('Questions', '<Questions>\nno list here\n</Questions>\n')
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toMatch(/needs a markdown list/)
  })
})

describe('Stat block', () => {
  it('parses "- label: value (intent) -- caption" into a stat item (golden)', () => {
    const { value, issues } = parseBlock(
      'Stat',
      '<Stat>\n- Est. uptime: 99.9% (good) -- rolling avg\n</Stat>\n',
    )
    expect(issues).toEqual([])
    expect(value).toEqual([
      { label: 'Est. uptime', value: '99.9%', intent: 'good', caption: 'rolling avg' },
    ])
  })

  it('flags an unknown intent word (error)', () => {
    const { issues } = parseBlock('Stat', '<Stat>\n- RPO: 5 min (bogus)\n</Stat>\n')
    expect(issues.some(issue => /must be one of: note, good, warn, risk/.test(issue.message))).toBe(
      true,
    )
  })

  it('flags a bullet with no colon (error)', () => {
    const { issues } = parseBlock('Stat', '<Stat>\n- just a label\n</Stat>\n')
    expect(issues.some(issue => /must be "label: value"/.test(issue.message))).toBe(true)
  })

  it('splits on the first colon so a value may contain one, with no intent (edge)', () => {
    const { value, issues } = parseBlock(
      'Stat',
      '<Stat>\n- Deploy window: 5:00 -- nightly\n</Stat>\n',
    )
    expect(issues).toEqual([])
    expect(value).toEqual([{ label: 'Deploy window', value: '5:00', caption: 'nightly' }])
  })

  it('flags a block with no list (edge)', () => {
    const { issues } = parseBlock('Stat', '<Stat>\nno list here\n</Stat>\n')
    expect(issues.some(issue => /needs a markdown list/.test(issue.message))).toBe(true)
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
