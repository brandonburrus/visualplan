import { visit } from 'unist-util-visit'
import { BLOCK_DATA_ATTR, CHILD_BLOCK_COMPONENTS, parseBlockChildren } from './plan-blocks.js'

interface MdxJsxAttribute {
  type: string
  name?: string
  value?: unknown
}

interface MdxJsxElement {
  type: string
  name?: string | null
  attributes?: MdxJsxAttribute[]
  children: unknown[]
}

const BLOCK_NAMES: readonly string[] = CHILD_BLOCK_COMPONENTS

/**
 * Translate the markdown-list children of the list-shaped plan components
 * (FileTree, Checklist, Questions, Chart, Compare) into a JSON-string data prop,
 * then drop the children. The component decodes that prop at render and validates
 * it with zod, exactly as if the data had been written inline.
 *
 * Runs in the remark (mdast) stage AFTER remark-gfm (so task-list `checked` state
 * is available) and alongside remarkMermaid. Mirrors how remarkMermaid passes a
 * diagram as a string attribute.
 */
export function remarkPlanBlocks() {
  return (tree: unknown) => {
    visit(tree as never, 'mdxJsxFlowElement', (node: MdxJsxElement) => {
      const name = node.name
      if (!name || !BLOCK_NAMES.includes(name)) return
      const attr = BLOCK_DATA_ATTR[name]
      if (!attr) return
      const { value } = parseBlockChildren(name, node)
      node.attributes = (node.attributes ?? []).filter(
        candidate => !(candidate.type === 'mdxJsxAttribute' && candidate.name === attr),
      )
      node.attributes.push({ type: 'mdxJsxAttribute', name: attr, value: JSON.stringify(value) })
      node.children = []
    })
  }
}
