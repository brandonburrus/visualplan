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

  it('routes a ```mermaid fence to the Mermaid container (golden)', () => {
    expect(html).toContain('vp-mermaid')
  })

  it('mounts the chart container for the estimate chart (edge)', () => {
    expect(html).toContain('vp-chart')
  })
})
