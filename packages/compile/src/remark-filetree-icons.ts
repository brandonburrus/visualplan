import { visit } from 'unist-util-visit'
import { fileIconSvg } from './file-icons.js'

interface MdxJsxAttribute {
  type: string
  name?: string
  value?: unknown
}

interface MdxJsxElement {
  type: string
  name?: string | null
  attributes?: MdxJsxAttribute[]
}

interface FileEntry {
  path: string
  change: string
  from?: string
  comment?: string
  icon?: string
}

/**
 * A Node-only remark pass that inlines a Material Icon Theme file-type icon into each `<FileTree>`
 * entry. It runs AFTER `remarkPlanBlocks` (which serializes the entries onto the `files` attribute)
 * and is added only in the CLI render path, so the browser bundle and the in-browser `/view`
 * compiler never load `material-icon-theme`; those plans fall back to the runtime's generic icon.
 *
 * A directory entry (a path ending in `/`) keeps the folder icon and is left untouched. The icon
 * SVG comes from a trusted build-time dependency, so the runtime injects it as-is.
 */
export function remarkFileTreeIcons() {
  return (tree: unknown) => {
    visit(tree as never, 'mdxJsxFlowElement', (node: MdxJsxElement) => {
      if (node.name !== 'FileTree') return
      const attribute = (node.attributes ?? []).find(
        candidate => candidate.type === 'mdxJsxAttribute' && candidate.name === 'files',
      )
      if (!attribute || typeof attribute.value !== 'string') return
      let entries: FileEntry[]
      try {
        entries = JSON.parse(attribute.value)
      } catch {
        return
      }
      if (!Array.isArray(entries)) return
      for (const entry of entries) {
        if (!entry || typeof entry.path !== 'string' || entry.path.endsWith('/')) continue
        const basename = entry.path.split('/').filter(Boolean).pop() ?? entry.path
        const icon = fileIconSvg(basename)
        if (icon) entry.icon = icon
      }
      attribute.value = JSON.stringify(entries)
    })
  }
}
