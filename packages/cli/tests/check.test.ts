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
