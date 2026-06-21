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

  it('renders a move at its destination and flags an empty tree (edge)', () => {
    const move = parseBlock(
      'FileTree',
      '<FileTree>\n- move src/old.ts -> src/new.ts\n</FileTree>\n',
    )
    expect(move.value).toEqual([{ path: 'src/new.ts', change: 'move' }])
    expect(move.issues).toEqual([])

    const empty = parseBlock('FileTree', '<FileTree>\nno list here\n</FileTree>\n')
    expect(empty.issues).toHaveLength(1)
    expect(empty.issues[0]?.message).toMatch(/needs a markdown list/)
  })
})

describe('Chart block', () => {
  it('parses "- <label>: <value>" bullets into numeric points (golden)', () => {
    const { value, issues } = parseBlock(
      'Chart',
      '<Chart type="bar">\n- API: 3\n- UI: 2\n</Chart>\n',
    )
    expect(issues).toEqual([])
    expect(value).toEqual([
      { label: 'API', value: 3 },
      { label: 'UI', value: 2 },
    ])
  })

  it('flags a non-numeric value (error)', () => {
    const { value, issues } = parseBlock('Chart', '<Chart type="bar">\n- API: lots\n</Chart>\n')
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toMatch(/non-numeric value/)
    // The raw value is kept (not a number) so render-time zod also rejects it.
    expect(value).toEqual([{ label: 'API', value: 'lots' }])
  })

  it('splits on the last colon so labels may contain one (edge)', () => {
    const { value } = parseBlock('Chart', '<Chart type="line">\n- p95: latency: 120\n</Chart>\n')
    expect(value).toEqual([{ label: 'p95: latency', value: 120 }])
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
