// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { assertPlanIsSafe, UnsafePlanError } from '../src/safety-gate.js'

/**
 * The safety gate is the security boundary for untrusted `/view` payloads: it must reject every
 * way a crafted plan could smuggle executable code, and must never reject a legitimate plan. Each
 * forbidden construct gets its own rejection test; the golden tests prove real plans pass.
 */

/** The canonical comprehensive plan, which exercises every component; the gate must accept it. */
const exampleMdx = readFileSync(
  fileURLToPath(new URL('../../cli/templates/example.mdx', import.meta.url)),
  'utf8',
)

/** Assert the gate rejects `source`, and that the reason mentions `expected`. */
function expectRejected(source: string, expected: RegExp): void {
  let thrown: unknown
  try {
    assertPlanIsSafe(source)
  } catch (error) {
    thrown = error
  }
  expect(thrown, `expected ${JSON.stringify(source)} to be rejected`).toBeInstanceOf(
    UnsafePlanError,
  )
  expect((thrown as UnsafePlanError).message).toMatch(expected)
}

describe('assertPlanIsSafe: accepts legitimate plans', () => {
  it('accepts the comprehensive example plan unchanged', () => {
    expect(() => assertPlanIsSafe(exampleMdx)).not.toThrow()
  })

  it('accepts the full vocabulary, prose, lists, tables, and code/mermaid/math fences', () => {
    const plan = [
      '# A plan',
      '',
      'Some **bold** and `inline code` and a [safe link](https://example.com).',
      '',
      '<Phase title="Build" status="active">',
      '1. Do the thing',
      '</Phase>',
      '',
      '<FileTree>',
      '- add src/a.ts',
      '</FileTree>',
      '',
      '<Callout type="risk">',
      'Careful here.',
      '</Callout>',
      '',
      '<Matrix>',
      '| Dim | A (pick) | B |',
      '|-----|----------|---|',
      '| x   | high     | low |',
      '</Matrix>',
      '',
      '```mermaid',
      'flowchart LR',
      '  A --> B',
      '```',
      '',
      '```math',
      '\\sum_{i=1}^{n} i',
      '```',
      '',
      '```ts title="a.ts"',
      'const evil = () => fetch("/x") // inert: code fences are not executed',
      '```',
    ].join('\n')
    expect(() => assertPlanIsSafe(plan)).not.toThrow()
  })

  it('accepts relative, anchor, and mailto links', () => {
    expect(() => assertPlanIsSafe('# P\n\n[a](./rel) [b](#frag) [c](mailto:x@y.z)')).not.toThrow()
  })

  it('accepts an empty document', () => {
    expect(() => assertPlanIsSafe('')).not.toThrow()
  })
})

describe('assertPlanIsSafe: rejects injected JavaScript', () => {
  it('rejects an import statement', () => {
    expectRejected('import x from "y"\n\n# P', /import\/export/)
  })

  it('rejects an export statement', () => {
    expectRejected('export const x = 1\n\n# P', /import\/export/)
  })

  it('rejects a flow expression', () => {
    expectRejected('# P\n\n{alert(1)}', /\{ \} expression/)
  })

  it('rejects a text expression', () => {
    expectRejected('# P\n\nHello {globalThis.alert(1)} there', /\{ \} expression/)
  })

  it('rejects an expression-valued attribute on a vocabulary component', () => {
    expectRejected('# P\n\n<Phase title={location.href}>x</Phase>', /\{ \} expression/)
  })

  it('rejects a spread/expression attribute', () => {
    expectRejected('# P\n\n<Phase {...props}>x</Phase>', /spread or expression/)
  })

  it('rejects an event-handler attribute', () => {
    expectRejected('# P\n\n<Phase onClick="steal()">x</Phase>', /event handler/)
  })
})

describe('assertPlanIsSafe: rejects unknown elements and HTML injection', () => {
  it('rejects an unknown component', () => {
    expectRejected('# P\n\n<Evil />', /unknown <Evil> element/)
  })

  it('rejects a script element', () => {
    expectRejected('# P\n\n<script>alert(1)</script>', /unknown <script> element/)
  })

  it('rejects an img element with an event handler', () => {
    // The unknown-element check fires first (img is not vocabulary), which is sufficient.
    expectRejected('# P\n\n<img src="x" onerror="alert(1)" />', /unknown <img> element/)
  })
})

describe('assertPlanIsSafe: rejects dangerous URLs and images', () => {
  it('rejects a javascript: link', () => {
    expectRejected('# P\n\n[click](javascript:alert(1))', /unsafe link URL/)
  })

  it('rejects a javascript: link obfuscated with an HTML entity', () => {
    // The markdown parser decodes `&#x3a;` to `:` before the gate sees the URL, so this resolves
    // to `javascript:alert(1)` and must be caught. (A control-char obfuscation is not a threat:
    // micromark drops a link whose destination contains whitespace or control characters.)
    expectRejected('# P\n\n[click](javascript&#x3a;alert(1))', /unsafe link URL/)
  })

  it('rejects a data: link', () => {
    expectRejected('# P\n\n[x](data:text/html,<script>alert(1)</script>)', /unsafe link URL/)
  })

  it('rejects a markdown image (external request, breaks self-containment)', () => {
    expectRejected('# P\n\n![alt](https://evil.example/x.png)', /embedded image/)
  })
})

describe('UnsafePlanError', () => {
  it('carries the position of the offending node', () => {
    try {
      assertPlanIsSafe('# P\n\n{alert(1)}')
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(UnsafePlanError)
      expect((error as UnsafePlanError).line).toBe(3)
      expect((error as UnsafePlanError).column).toBe(1)
    }
  })
})
