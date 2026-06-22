interface MdNode {
  type?: string
  name?: string | null
  attributes?: Array<{ type?: string; name?: string; value?: unknown }>
  children?: MdNode[]
}

interface FileEntry {
  path: string
  change: string
  from?: string
  comment?: string
  icon?: string
}

/** Collect every `<FileTree>` JSX node in the tree (manual walk, so this stays dependency-free). */
function collectFileTrees(node: MdNode, found: MdNode[]): void {
  if (node.type === 'mdxJsxFlowElement' && node.name === 'FileTree') found.push(node)
  for (const child of node.children ?? []) collectFileTrees(child, found)
}

/**
 * The `/view` counterpart of the CLI's `remarkFileTreeIcons`: it inlines a Material file-type icon
 * into each `<FileTree>` entry so a shared plan shows the same colored icons a local render does.
 *
 * It runs AFTER `remarkPlanBlocks` (which serializes the entries onto the `files` attribute) and is
 * appended only in the browser compiler. Crucially, the heavy icon module is imported LAZILY and
 * only when a plan actually contains a `<FileTree>`, so a plan without one never downloads the icon
 * manifest or any SVG chunk. A directory entry (a path ending in `/`) keeps its folder icon.
 */
export function remarkFileTreeIconsBrowser() {
  return async (tree: MdNode) => {
    const fileTrees: MdNode[] = []
    collectFileTrees(tree, fileTrees)
    const targets: Array<{ attribute: { value?: unknown }; entries: FileEntry[] }> = []
    for (const node of fileTrees) {
      const attribute = (node.attributes ?? []).find(
        candidate => candidate.type === 'mdxJsxAttribute' && candidate.name === 'files',
      )
      if (!attribute || typeof attribute.value !== 'string') continue
      try {
        const entries = JSON.parse(attribute.value)
        if (Array.isArray(entries)) targets.push({ attribute, entries })
      } catch {
        // A non-JSON files attribute is left untouched; the component surfaces the error at render.
      }
    }
    if (!targets.length) return

    // Code-split: the manifest + per-icon loaders load only now, when a FileTree is present.
    const { fileIconSvg } = await import('./file-icons-browser')
    for (const { attribute, entries } of targets) {
      await Promise.all(
        entries.map(async entry => {
          if (!entry || typeof entry.path !== 'string' || entry.path.endsWith('/')) return
          const basename = entry.path.split('/').filter(Boolean).pop() ?? entry.path
          const icon = await fileIconSvg(basename)
          if (icon) entry.icon = icon
        }),
      )
      attribute.value = JSON.stringify(entries)
    }
  }
}
