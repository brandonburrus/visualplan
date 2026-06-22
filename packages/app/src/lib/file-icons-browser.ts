import { type IconManifest, resolveIconName } from '@visualplan/compile/icon-resolution'
import manifest from 'material-icon-theme/dist/material-icons.json'

/**
 * The browser counterpart of the CLI's `fileIconSvg`: resolves a file name to its Material Icon
 * Theme SVG markup for the `/view` shared-plan renderer. This module is imported lazily (only when
 * a plan actually contains a `<FileTree>`), so the 449 KB manifest below is a code-split chunk that
 * never weighs on the main bundle.
 *
 * The icon SVGs themselves are loaded PER ICON: `import.meta.glob` (non-eager) makes Vite emit one
 * tiny chunk per `.svg`, so a rendered plan fetches only the handful of icon types it uses, not the
 * full 5 MB set. Resolution order is single-sourced through `@visualplan/compile`'s isomorphic
 * `resolveIconName`, so `/view` and the CLI pick identical icons.
 */
const typedManifest = manifest as unknown as IconManifest

const iconLoaders = import.meta.glob('../../node_modules/material-icon-theme/icons/*.svg', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

/** The per-icon loaders are keyed by their full glob path; index them by SVG basename instead. */
const loaderByBasename = new Map<string, () => Promise<string>>()
for (const [path, loader] of Object.entries(iconLoaders)) {
  const basename = path.split('/').pop()
  if (basename) loaderByBasename.set(basename, loader)
}

/** Resolved icon markup, keyed by icon name (`null` marks a name with no loadable SVG). */
const svgCache = new Map<string, string | null>()

/** Resolve a basename to its Material icon SVG markup, fetching only that icon's chunk. */
export async function fileIconSvg(fileName: string): Promise<string | null> {
  const iconName = resolveIconName(typedManifest, fileName)
  const cached = svgCache.get(iconName)
  if (cached !== undefined) return cached
  const basename = typedManifest.iconDefinitions[iconName]?.iconPath.split('/').pop()
  const loader = basename ? loaderByBasename.get(basename) : undefined
  const svg = loader ? await loader() : null
  svgCache.set(iconName, svg)
  return svg
}
