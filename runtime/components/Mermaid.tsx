import mermaid from 'mermaid'
import { useEffect, useId, useRef, useState } from 'react'

interface MermaidProps {
  chart: string
}

let initialized = false

function ensureInitialized() {
  if (initialized) return
  mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' })
  initialized = true
}

/** Renders a mermaid diagram from the text of a ```mermaid code fence. */
export function Mermaid({ chart }: MermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const reactId = useId()
  const [error, setError] = useState<string | null>(null)
  // mermaid ids must be valid CSS selectors; React's useId contains ':'.
  const renderId = `vp-mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`

  useEffect(() => {
    let cancelled = false
    ensureInitialized()
    mermaid
      .render(renderId, chart)
      .then(({ svg }) => {
        if (!cancelled && containerRef.current) containerRef.current.innerHTML = svg
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [chart, renderId])

  if (error) {
    return (
      <pre className='vp-mermaid vp-mermaid--error'>
        Mermaid error: {error}
        {'\n\n'}
        {chart}
      </pre>
    )
  }
  return <div className='vp-mermaid' ref={containerRef} />
}
