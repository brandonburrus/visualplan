// @vitest-environment node
import { MDXProvider } from '@mdx-js/react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { compilePlan } from '../src/lib/compile-browser'

/**
 * Pins the in-browser compiler that backs /view. The full UI states (spinner, error cards, the
 * sandboxed iframe) are covered by the end-to-end browser run; these tests pin the compile step:
 * a valid plan compiles with render parity to the CLI, and the safety gate refuses untrusted input
 * before any code runs. Stub components stand in for the runtime so the test needs no DOM/CSS.
 */

/** Minimal stand-ins for the runtime vocabulary, surfacing props/children as text to assert on. */
// biome-ignore lint/suspicious/noExplicitAny: test stubs accept whatever props the MDX passes.
const stub = (name: string) => (props: any) =>
  createElement('div', { 'data-component': name }, props.title ?? props.chart ?? props.children)
const components = { Phase: stub('Phase'), Mermaid: stub('Mermaid') }

async function renderPlan(source: string): Promise<string> {
  const Content = await compilePlan(source)
  return renderToStaticMarkup(createElement(MDXProvider, { components }, createElement(Content)))
}

describe('compilePlan: valid plans (golden)', () => {
  it('compiles a plan and highlights code via Expressive Code', async () => {
    const html = await renderPlan(
      ['# Demo', '', '```ts title="limiter.ts"', 'export const limit = 100', '```'].join('\n'),
    )
    expect(html).toContain('expressive-code')
    // The frame title (filename) and a highlighted token are both present.
    expect(html).toContain('limiter.ts')
    expect(html).toContain('limit')
  })

  it('rewrites a mermaid fence to the Mermaid component with its chart', async () => {
    const html = await renderPlan(
      ['# Demo', '', '```mermaid', 'flowchart LR', '  A --> B', '```'].join('\n'),
    )
    expect(html).toContain('data-component="Mermaid"')
    expect(html).toContain('flowchart LR')
  })

  it('passes component props through (edge: a bare title-only plan)', async () => {
    const html = await renderPlan('# Just a title\n\n<Phase title="Ship it">x</Phase>')
    expect(html).toContain('data-component="Phase"')
    expect(html).toContain('Ship it')
  })
})

describe('compilePlan: untrusted input (error)', () => {
  it('refuses a plan containing a JavaScript expression, before compiling', async () => {
    await expect(compilePlan('# Bad\n\n{globalThis.alert(1)}')).rejects.toMatchObject({
      name: 'UnsafePlanError',
    })
  })

  it('refuses a plan containing a script element', async () => {
    await expect(compilePlan('# Bad\n\n<script>steal()</script>')).rejects.toMatchObject({
      name: 'UnsafePlanError',
    })
  })

  it('refuses a plan with a javascript: link', async () => {
    await expect(compilePlan('# Bad\n\n[x](javascript:alert(1))')).rejects.toMatchObject({
      name: 'UnsafePlanError',
    })
  })
})
