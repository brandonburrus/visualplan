import temml from 'temml'
import { visit } from 'unist-util-visit'

interface MdastCode {
  type: 'code'
  lang?: string | null
  value: string
}

interface MdastParent {
  children: unknown[]
}

/**
 * Convert ```math fenced code blocks into a `<Math>` element holding the MathML that Temml
 * renders from the block's LaTeX. The LaTeX-to-MathML conversion happens here at build time, so
 * no math library ships to the browser; the Math component only injects the pre-rendered MathML.
 *
 * Runs in the remark (mdast) stage, BEFORE rehype-expressive-code, so the highlighter never sees
 * math blocks. Mirrors remark-mermaid.
 */
export function remarkMath() {
  return (tree: unknown) => {
    visit(
      tree as never,
      'code',
      (node: MdastCode, index: number | undefined, parent: MdastParent | undefined) => {
        if (node.lang !== 'math' || !parent || index === undefined) return
        // throwOnError: false keeps a single malformed formula from failing the whole render;
        // Temml emits an inline error node instead. `vplan check` reports bad LaTeX separately
        // as file:line:col for the self-correction loop.
        const mathml = temml.renderToString(node.value, { displayMode: true, throwOnError: false })
        parent.children[index] = {
          type: 'mdxJsxFlowElement',
          name: 'Math',
          attributes: [{ type: 'mdxJsxAttribute', name: 'html', value: mathml }],
          children: [],
        }
      },
    )
  }
}
