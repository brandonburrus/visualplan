import { MDXProvider } from '@mdx-js/react'
import { type ComponentType, isValidElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Callout } from './components/Callout.js'
import { Chart } from './components/Chart.js'
import { Compare } from './components/Compare.js'
import { FileTree } from './components/FileTree.js'
import { Mermaid } from './components/Mermaid.js'
import { Phase } from './components/Phase.js'
import { Layout, type PlanMeta } from './Layout.js'
import './theme.css'

/** Intercepts ```mermaid fences (rendered by MDX as <pre><code class="language-mermaid">). */
function Pre(props: { children?: ReactNode }) {
  const child = props.children
  if (isValidElement<{ className?: string; children?: ReactNode }>(child)) {
    const className = child.props.className ?? ''
    if (/language-mermaid/.test(className)) {
      const code = String(child.props.children ?? '').replace(/\n$/, '')
      return <Mermaid chart={code} />
    }
  }
  return <pre {...props} />
}

/** The component scope auto-injected into every plan's MDX (no imports needed). */
export const components = {
  Phase,
  FileTree,
  Chart,
  Compare,
  Callout,
  pre: Pre,
}

/** Mount a compiled MDX plan into the page shell. */
export function mount(Plan: ComponentType, meta: PlanMeta) {
  const container = document.getElementById('root')
  if (!container) throw new Error('VisualPlan: #root element not found')
  createRoot(container).render(
    <MDXProvider components={components}>
      <Layout meta={meta}>
        <Plan />
      </Layout>
    </MDXProvider>,
  )
}
