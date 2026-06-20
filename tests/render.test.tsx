import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { evaluate } from '@mdx-js/mdx'
import { MDXProvider, useMDXComponents } from '@mdx-js/react'
import * as runtime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import { beforeAll, describe, expect, it } from 'vitest'
import { components } from '../runtime/index.js'

const examplePath = join(process.cwd(), 'templates/example.mdx')
let html: string

beforeAll(async () => {
  const source = await readFile(examplePath, 'utf8')
  const mdxModule = await evaluate(source, {
    ...runtime,
    useMDXComponents,
    remarkPlugins: [remarkFrontmatter, [remarkMdxFrontmatter, { name: 'frontmatter' }]],
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

  it('syntax-highlights a fenced code block (golden)', () => {
    // the ```ts block renders through highlight.js into hljs token spans
    expect(html).toContain('class="hljs')
    expect(html).toContain('hljs-keyword')
  })
})
