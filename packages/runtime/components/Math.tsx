interface MathProps {
  /** MathML markup produced at build time by Temml from a ```math fence's LaTeX. */
  html: string
}

/**
 * Renders a display equation from a ```math fence. The LaTeX was converted to MathML at build
 * time by Temml (see the CLI's remark-math plugin), so no math library runs in the browser; this
 * component only injects the markup, which the browser typesets and which tracks the theme via
 * `currentColor`.
 */
export function MathBlock({ html }: MathProps) {
  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted MathML from our own build-time Temml conversion of author-provided LaTeX, not untrusted HTML
    <div className='vp-math' dangerouslySetInnerHTML={{ __html: html }} />
  )
}
