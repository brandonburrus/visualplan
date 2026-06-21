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

/** beautiful-mermaid injects `@import url('https://fonts.googleapis.com/...')` into the SVG's
 * inline <style> (one per font it themes with). That would make the supposedly self-contained page
 * fetch Google Fonts at view time, breaking the single-file invariant, so strip those imports. The
 * SVG's font-family keeps its system-stack fallback, which matches our page font anyway. The quoted
 * capture survives URLs that contain parens (e.g. a `var(--vp-font)` family). */
function stripExternalFontImports(svg: string): string {
  return svg.replace(/@import\s+url\(\s*(['"])(.*?)\1\s*\)\s*;/g, (full, _quote, url) =>
    typeof url === 'string' && url.includes('fonts.googleapis.com') ? '' : full,
  )
}

/** Map the diagram's first keyword to a human label so the rendered SVG has an accessible name
 * (the injected SVG itself carries no title), rather than being announced as nothing or as a jumble
 * of its node text. */
function diagramLabel(chart: string): string {
  const first = chart.trim().split(/\s|\n/, 1)[0]?.toLowerCase() ?? ''
  if (first === 'flowchart' || first === 'graph') return 'Flowchart diagram'
  if (first === 'sequencediagram') return 'Sequence diagram'
  if (first.startsWith('statediagram')) return 'State diagram'
  if (first === 'classdiagram') return 'Class diagram'
  if (first === 'erdiagram') return 'Entity-relationship diagram'
  if (first.startsWith('xychart')) return 'XY chart'
  return 'Diagram'
}

/**
 * Renders a mermaid diagram from the text of a ```mermaid code fence. Rendering is
 * synchronous and DOM-free, so the SVG is present in the static HTML output (not
 * just after a client-side effect).
 */
export function Mermaid({ chart }: MermaidProps) {
  let svg: string
  try {
    svg = stripExternalFontImports(renderMermaidSVG(chart, THEME))
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
      {/* role=img + a derived label give the diagram an accessible name; without it a screen
          reader gets nothing (the injected SVG has no <title>). */}
      <div
        className='vp-mermaid__svg'
        role='img'
        aria-label={diagramLabel(chart)}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted SVG from our own synchronous renderer over author-provided diagram text, not untrusted HTML
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <ExpandButton />
    </div>
  )
}
