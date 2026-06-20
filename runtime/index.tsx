import { MDXProvider } from '@mdx-js/react'
import { type ComponentType, isValidElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Callout } from './components/Callout.js'
import { Chart } from './components/Chart.js'
import { Compare } from './components/Compare.js'
import { FileTree } from './components/FileTree.js'
import { highlightCode } from './components/highlight.js'
import { Mermaid } from './components/Mermaid.js'
import { Phase } from './components/Phase.js'
import { Questions } from './components/Questions.js'
import { Layout } from './Layout.js'
import './theme.css'

/**
 * Handles fenced code blocks (rendered by MDX as <pre><code class="language-X">):
 * ```mermaid becomes a diagram, any known language is syntax-highlighted, and
 * everything else falls through to a plain <pre>.
 */
function Pre(props: { children?: ReactNode }) {
  const child = props.children
  if (isValidElement<{ className?: string; children?: ReactNode }>(child)) {
    const className = child.props.className ?? ''
    const code = String(child.props.children ?? '').replace(/\n$/, '')
    if (/language-mermaid/.test(className)) {
      return <Mermaid chart={code} />
    }
    const language = /language-([\w-]+)/.exec(className)?.[1]
    const highlighted = language ? highlightCode(code, language) : null
    if (highlighted) {
      return (
        <pre className='vp-code'>
          <code
            className={`hljs language-${highlighted.language}`}
            // biome-ignore lint/security/noDangerouslySetInnerHtml: highlight.js escapes the source and emits trusted token spans
            dangerouslySetInnerHTML={{ __html: highlighted.html }}
          />
        </pre>
      )
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
  Questions,
  pre: Pre,
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
