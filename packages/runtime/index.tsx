import { MDXProvider } from '@mdx-js/react'
import type { ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { Callout } from './components/Callout.js'
import { Chart } from './components/Chart.js'
import { Checklist } from './components/Checklist.js'
import { Compare } from './components/Compare.js'
import { FileTree } from './components/FileTree.js'
import { MathBlock } from './components/Math.js'
import { Matrix } from './components/Matrix.js'
import { Mermaid } from './components/Mermaid.js'
import { Phase } from './components/Phase.js'
import { Questions } from './components/Questions.js'
import { Layout } from './Layout.js'
import './theme.css'

/**
 * The component scope auto-injected into every plan's MDX (no imports needed).
 * Mermaid and Math are here because remark plugins rewrite ```mermaid and ```math fences to
 * <Mermaid> / <Math>; fenced code blocks are highlighted at build time by rehype-expressive-code.
 */
export const components = {
  Phase,
  FileTree,
  Chart,
  Compare,
  Matrix,
  Callout,
  Questions,
  Checklist,
  Mermaid,
  Math: MathBlock,
}

/** Mount a compiled MDX plan into the page shell. */
export function mount(Plan: ComponentType) {
  const container = document.getElementById('root')
  if (!container) throw new Error('VisualPlan: #root element not found')
  createRoot(container).render(
    <MDXProvider components={components}>
      <Layout>
        <Plan />
      </Layout>
    </MDXProvider>,
  )
}
