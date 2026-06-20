import { renderMermaidSVG, type RenderOptions } from 'beautiful-mermaid'
import { ExpandButton } from './ExpandButton.js'

interface MermaidProps {
  chart: string
}

/**
 * Theme mapped onto our CSS custom properties. Because beautiful-mermaid emits the
 * colors as CSS variables, one synchronously-rendered SVG adapts to light and dark
 * automatically (the vars change with `prefers-color-scheme`), so there is no theme
 * detection and no re-render on scheme change.
 */
const THEME: RenderOptions = {
  bg: 'var(--vp-bg)',
  fg: 'var(--vp-text)',
  line: 'var(--vp-muted)',
  accent: 'var(--vp-accent)',
  muted: 'var(--vp-muted)',
  surface: 'var(--vp-surface)',
  border: 'var(--vp-border-strong)',
  font: 'var(--vp-font)',
  transparent: true,
}

/**
 * Renders a mermaid diagram from the text of a ```mermaid code fence. Rendering is
 * synchronous and DOM-free, so the SVG is present in the static HTML output (not
 * just after a client-side effect).
 */
export function Mermaid({ chart }: MermaidProps) {
  let svg: string
  try {
    svg = renderMermaidSVG(chart, THEME)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return (
      <pre className='vp-mermaid vp-mermaid--error'>
        Mermaid error: {message}
        {'\n\n'}
        {chart}
      </pre>
    )
  }
  return (
    <div className='vp-mermaid vp-expandable'>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: trusted SVG from our own synchronous renderer over author-provided diagram text, not untrusted HTML */}
      <div className='vp-mermaid__svg' dangerouslySetInnerHTML={{ __html: svg }} />
      <ExpandButton />
    </div>
  )
}
