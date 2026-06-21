// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { evaluate } from '@mdx-js/mdx'
import { MDXProvider, useMDXComponents } from '@mdx-js/react'
import { components } from '@visualplan/runtime'
import * as runtime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import { beforeAll, describe, expect, it } from 'vitest'
import { remarkMermaid } from '../src/build/remark-mermaid.js'
import { remarkPlanBlocks } from '../src/build/remark-plan-blocks.js'

const examplePath = fileURLToPath(new URL('../templates/example.mdx', import.meta.url))
let html: string

beforeAll(async () => {
  const source = await readFile(examplePath, 'utf8')
  const mdxModule = await evaluate(source, {
    ...runtime,
    useMDXComponents,
    remarkPlugins: [
      remarkFrontmatter,
      [remarkMdxFrontmatter, { name: 'frontmatter' }],
      remarkGfm,
      remarkPlanBlocks,
      remarkMermaid,
    ],
  })
  const Content = mdxModule.default
  html = renderToStaticMarkup(
    <MDXProvider components={components}>
      <Content />
    </MDXProvider>,
  )
})

describe('full plan render (MDX -> component DOM)', () => {
  it('renders phase, callout, filetree, and compare content (golden)', () => {
    expect(html).toContain('Build the limiter')
    expect(html).toContain('Risk')
    expect(html).toContain('rate-limiter.ts')
    expect(html).toContain('Redis sliding window')
  })

  it('renders a ```mermaid fence to an inline SVG synchronously (golden)', () => {
    expect(html).toContain('vp-mermaid')
    // beautiful-mermaid renders synchronously and DOM-free, so the SVG is present
    // in the server-rendered markup, not just a client-mounted container.
    expect(html).toContain('<svg')
  })

  it('gives the mermaid diagram an accessible name (golden)', () => {
    // The injected SVG has no <title>, so the container carries role=img + a derived
    // label; the example's diagram is a flowchart.
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Flowchart diagram"')
  })

  it('mounts the chart container for the estimate chart (edge)', () => {
    expect(html).toContain('vp-chart')
  })

  it('renders the H1 title and numbered timeline nodes, not a sidebar (golden)', () => {
    expect(html).toContain('<h1>Add rate limiting to the API</h1>')
    expect(html).toContain('vp-phase__node')
    expect(html).not.toContain('vp-toc')
    expect(html).not.toContain('vp-header')
  })

  it('leaks no raw frontmatter into the content (edge)', () => {
    expect(html).not.toContain('author:')
  })
})
