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
 * Convert ```mermaid fenced code blocks into `<Mermaid chart="..." />` MDX JSX
 * elements. This runs in the remark (mdast) stage, BEFORE rehype-expressive-code,
 * so the code highlighter never sees mermaid blocks and the diagram renders via the
 * Mermaid component instead.
 */
export function remarkMermaid() {
  return (tree: unknown) => {
    visit(
      tree as never,
      'code',
      (node: MdastCode, index: number | undefined, parent: MdastParent | undefined) => {
        if (node.lang !== 'mermaid' || !parent || index === undefined) return
        parent.children[index] = {
          type: 'mdxJsxFlowElement',
          name: 'Mermaid',
          attributes: [{ type: 'mdxJsxAttribute', name: 'chart', value: node.value }],
          children: [],
        }
      },
    )
  }
}
