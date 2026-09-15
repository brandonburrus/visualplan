import { svgSchema } from '@visualplan/core'
import { ExpandButton } from './ExpandButton.js'
import { validateProps } from './validate.js'

interface SvgProps {
  src?: string
  title?: string
  caption?: string
  /** The file's markup, inlined at build time by the CLI's svg-include step. */
  svg?: string
  /** Why it could not be inlined (set by the same step); rendered in place, like a Mermaid error. */
  error?: string
}

/**
 * An SVG diagram from a local file, inlined at build time so the page stays self-contained. The
 * markup arrives already sanitized (allow-listed, refused rather than stripped — see the CLI's
 * `svg-include.ts`); this component only frames it: the same expandable wrapper Mermaid uses, an
 * accessible name from `title` (the SVG's own <title> may be a tool's default), and a caption.
 */
export function Svg(props: SvgProps) {
  const { src, title, caption, svg, error } = validateProps('Svg', svgSchema, props)
  if (!svg) {
    return (
      <pre className='vp-svg vp-svg--error'>Svg error: {error ?? `${src} was not inlined`}</pre>
    )
  }
  return (
    <figure className='vp-svg vp-expandable'>
      <div
        className='vp-svg__svg'
        role='img'
        aria-label={title ?? src}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized SVG inlined at build time from a local file the author named; refused (not stripped) on any script/handler/external reference
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <ExpandButton />
      {caption ? <figcaption className='vp-svg__caption'>{caption}</figcaption> : null}
    </figure>
  )
}
