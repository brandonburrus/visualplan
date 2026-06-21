// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkPlan } from '../src/build/check.js'

const examplePath = fileURLToPath(new URL('../templates/example.mdx', import.meta.url))
let workDir: string

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'visualplan-check-test-'))
})

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true })
})

async function writePlan(name: string, body: string): Promise<string> {
  const path = join(workDir, name)
  await writeFile(path, body, 'utf8')
  return path
}

describe('checkPlan', () => {
  it('reports no issues for the valid example (golden)', async () => {
    const issues = await checkPlan(examplePath)
    expect(issues).toEqual([])
  })

  it('flags an invalid enum value with valid options (error)', async () => {
    const path = await writePlan('bad-enum.mdx', '<Callout type="bogus">x</Callout>\n')
    const issues = await checkPlan(path)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toMatch(/type="bogus" is invalid/)
    expect(issues[0]?.message).toMatch(/note, risk, decision, warn/)
  })

  it('flags an unknown component (error)', async () => {
    const path = await writePlan('unknown.mdx', '<Phse title="typo" />\n')
    const issues = await checkPlan(path)
    expect(issues[0]?.message).toMatch(/Unknown component <Phse>/)
  })

  it('reports a line/column for malformed MDX (edge)', async () => {
    const path = await writePlan('syntax.mdx', '<Callout type="note">unclosed\n')
    const issues = await checkPlan(path)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0]?.line).toBeGreaterThanOrEqual(1)
  })

  it('flags a bad change verb in a FileTree block with its line (error)', async () => {
    const path = await writePlan(
      'bad-filetree.mdx',
      '# T\n\n<FileTree>\n- frobnicate src/a.ts\n</FileTree>\n',
    )
    const issues = await checkPlan(path)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toMatch(/must start with a change: add, modify, delete, move/)
    expect(issues[0]?.line).toBe(4)
  })

  it('flags a non-numeric Chart value (error)', async () => {
    const path = await writePlan(
      'bad-chart.mdx',
      '# T\n\n<Chart type="bar">\n- API: lots\n</Chart>\n',
    )
    const issues = await checkPlan(path)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toMatch(/is not a number/)
  })

  it('accepts valid markdown-children blocks (golden)', async () => {
    const path = await writePlan(
      'good-blocks.mdx',
      '# T\n\n<Checklist title="Done when">\n- [x] one\n- [ ] two\n</Checklist>\n\n<Compare>\n## A (pick)\n- pro: fast\n\n## B\n- con: slow\n</Compare>\n',
    )
    expect(await checkPlan(path)).toEqual([])
  })

  it('accepts a valid Matrix and multi-series Chart (golden)', async () => {
    const path = await writePlan(
      'good-table-blocks.mdx',
      '# T\n\n<Matrix>\n| Dim | A (pick) | B |\n|---|---|---|\n| Writes | high | low |\n</Matrix>\n\n<Chart type="bar">\n| Stage | p50 | p95 |\n|---|---|---|\n| Auth | 12 | 30 |\n</Chart>\n',
    )
    expect(await checkPlan(path)).toEqual([])
  })

  it('flags a single-column Matrix (error)', async () => {
    const path = await writePlan(
      'bad-matrix.mdx',
      '# T\n\n<Matrix>\n| Dim | Only |\n|---|---|\n| Writes | high |\n</Matrix>\n',
    )
    const issues = await checkPlan(path)
    expect(issues.some(issue => /at least two value columns/.test(issue.message))).toBe(true)
  })

  it('flags a multi-series pie Chart (error)', async () => {
    const path = await writePlan(
      'bad-pie.mdx',
      '# T\n\n<Chart type="pie">\n| Stage | p50 | p95 |\n|---|---|---|\n| Auth | 12 | 30 |\n</Chart>\n',
    )
    const issues = await checkPlan(path)
    expect(issues.some(issue => /single series/.test(issue.message))).toBe(true)
  })

  it('points to the real line for an unclosed tag with no structured position (edge)', async () => {
    // MDX gives this error no line/column/place; the position is only in the message
    // ("(3:1-3:41)"). The checker must recover it so the prefix is not a misleading 1:1.
    const path = await writePlan(
      'unclosed-late.mdx',
      '# Title\n\n<Phase title="x" status="active">\n  no close\n',
    )
    const issues = await checkPlan(path)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0]?.line).toBe(3)
  })
})
