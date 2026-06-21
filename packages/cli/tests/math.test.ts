// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { remarkMath } from '@visualplan/compile'
import { checkPlan } from '../src/build/check.js'

interface JsxNode {
  type: string
  name?: string
  attributes?: { name: string; value: string }[]
}

/** Build a minimal mdast tree with one code node and run the plugin over it. */
function runOnCode(lang: string, value: string): JsxNode {
  const tree = { type: 'root', children: [{ type: 'code', lang, value }] }
  remarkMath()(tree)
  return tree.children[0] as JsxNode
}

describe('remarkMath', () => {
  it('rewrites a ```math fence to a <Math> element holding MathML (golden)', () => {
    const node = runOnCode('math', '\\frac{n(n+1)}{2}')
    expect(node.type).toBe('mdxJsxFlowElement')
    expect(node.name).toBe('Math')
    const html = node.attributes?.find(attribute => attribute.name === 'html')?.value ?? ''
    expect(html).toContain('<math')
    expect(html).toContain('</math>')
  })

  it('leaves a non-math code block untouched (edge)', () => {
    const node = runOnCode('ts', 'const x = 1')
    expect(node.type).toBe('code')
    expect(node.name).toBeUndefined()
  })

  it('emits an inline error instead of throwing on bad LaTeX (error)', () => {
    // throwOnError is false on the render path, so a malformed formula still produces a node.
    const node = runOnCode('math', '\\frac{1}{')
    expect(node.type).toBe('mdxJsxFlowElement')
    expect(node.name).toBe('Math')
  })
})

describe('checkPlan with math', () => {
  let workDir: string
  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'visualplan-math-test-'))
  })
  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true })
  })

  async function write(name: string, body: string): Promise<string> {
    const path = join(workDir, name)
    await writeFile(path, body, 'utf8')
    return path
  }

  it('passes valid LaTeX (golden)', async () => {
    const path = await write('ok.mdx', '# Ok\n\n```math\n\\sum_{i=1}^{n} i\n```\n')
    expect(await checkPlan(path)).toEqual([])
  })

  it('reports invalid LaTeX as file:line:col (error)', async () => {
    const path = await write('bad.mdx', '# Bad\n\n```math\n\\frac{1}{\n```\n')
    const issues = await checkPlan(path)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toMatch(/Invalid LaTeX in math block/)
    expect(issues[0]?.line).toBe(3)
  })
})
