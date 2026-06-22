import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { ExpressiveCodePlugin } from '@expressive-code/core'
import { addClassName, getClassNames, select, setProperty } from '@expressive-code/core/hast'
import type { Element, ElementContent } from 'hast'
import { fromHtml } from 'hast-util-from-html'

/**
 * An Expressive Code plugin that prepends a Material Icon Theme file-type icon to a code block's
 * title bar, modeled on `@xt0rted/expressive-code-file-icons` but sourcing icons from
 * `material-icon-theme`.
 *
 * Resolution and the SVGs both come from the package's published VS Code icon-theme manifest
 * (`dist/material-icons.json`) and `icons/*.svg`, read at build time and inlined into the page, so
 * the single-file output has no external asset request. The package has no `exports` map, so the
 * manifest and icon files are resolved directly from the package root.
 */
const require = createRequire(import.meta.url)
const packageRoot = dirname(require.resolve('material-icon-theme/package.json'))

interface IconManifest {
  iconDefinitions: Record<string, { iconPath: string }>
  fileNames: Record<string, string>
  fileExtensions: Record<string, string>
  languageIds: Record<string, string>
  /** The icon name used for any file that matches nothing more specific. */
  file: string
}

const manifest: IconManifest = JSON.parse(
  readFileSync(join(packageRoot, 'dist', 'material-icons.json'), 'utf8'),
)

/** Parsed icon SVGs, keyed by icon name. `null` marks a name with no usable icon. */
const iconCache = new Map<string, Element | null>()

/**
 * Resolve a title's filename (with an optional Expressive Code language id and explicit override)
 * to a Material icon name: an exact filename wins, then the longest matching extension, then the
 * language, then the default file icon.
 */
export function iconNameForFile(
  fileName: string,
  language?: string,
  iconOverride?: string,
): string {
  if (iconOverride && manifest.iconDefinitions[iconOverride]) return iconOverride
  const name = fileName.toLowerCase()
  if (manifest.fileNames[name]) return manifest.fileNames[name]
  // Try compound extensions before simple ones, e.g. "d.ts" before "ts", "test.tsx" before "tsx".
  const segments = name.split('.')
  for (let i = 1; i < segments.length; i++) {
    const extension = segments.slice(i).join('.')
    if (manifest.fileExtensions[extension]) return manifest.fileExtensions[extension]
  }
  if (language && manifest.languageIds[language]) return manifest.languageIds[language]
  return manifest.file
}

/** Resolved raw icon SVG markup, keyed by icon name (`null` marks a name with no usable icon). */
const svgCache = new Map<string, string | null>()

/**
 * Resolve a file name to its Material Icon Theme SVG markup, or `null` if none resolves. Used by
 * the CLI's remark-filetree-icons pass to inline a per-file icon into the FileTree data prop, so
 * the self-contained page needs no external asset. Pass a basename, not a full path, so an exact
 * filename match (e.g. `package.json`) wins over its extension.
 */
export function fileIconSvg(fileName: string): string | null {
  const iconName = iconNameForFile(fileName)
  const cached = svgCache.get(iconName)
  if (cached !== undefined) return cached
  const definition = manifest.iconDefinitions[iconName]
  const svg = definition
    ? readFileSync(join(packageRoot, 'dist', definition.iconPath), 'utf8')
    : null
  svgCache.set(iconName, svg)
  return svg
}

/** Read and parse an icon SVG into a hast element once, caching by icon name. */
function loadIcon(iconName: string): Element | null {
  const cached = iconCache.get(iconName)
  if (cached !== undefined) return cached
  const definition = manifest.iconDefinitions[iconName]
  if (!definition) {
    iconCache.set(iconName, null)
    return null
  }
  // iconPath is relative to the manifest in dist/, e.g. "./../icons/typescript.svg".
  const svg = readFileSync(join(packageRoot, 'dist', definition.iconPath), 'utf8')
  const root = fromHtml(svg, { fragment: true, space: 'svg' })
  const element =
    (root.children.find(child => child.type === 'element' && child.tagName === 'svg') as
      | Element
      | undefined) ?? null
  iconCache.set(iconName, element)
  return element
}

/** Terminal frames (shell sessions) get no file icon, matching the upstream plugin. */
function isTerminal(element: Element): boolean {
  return getClassNames(element).includes('is-terminal')
}

export interface PluginFileIconsOptions {
  /** A class added to the injected `<svg>` so the host stylesheet can size it. */
  iconClass?: string
}

export function pluginFileIcons({ iconClass }: PluginFileIconsOptions = {}): ExpressiveCodePlugin {
  return {
    name: 'Material file icons',
    hooks: {
      preprocessMetadata({ codeBlock }) {
        const { metaOptions, props } = codeBlock
        props.icon = metaOptions.getString('icon') ?? props.icon
        props.noIcon = metaOptions.getBoolean('no-icon') ?? props.noIcon
      },
      postprocessRenderedBlock({ codeBlock, renderData }) {
        if (codeBlock.props.noIcon) return
        if (isTerminal(renderData.blockAst)) return
        // The title prop is set by the frames plugin; with no title there is no icon slot.
        const titleText = codeBlock.props.title
        if (!titleText) return
        const icon = loadIcon(iconNameForFile(titleText, codeBlock.language, codeBlock.props.icon))
        if (!icon) return
        setProperty(icon, 'aria-hidden', 'true')
        if (iconClass) addClassName(icon, iconClass)
        const title = select('figcaption > .title', renderData.blockAst)
        if (!title) return
        title.children?.unshift(icon as ElementContent)
      },
    },
  }
}

declare module '@expressive-code/core' {
  interface ExpressiveCodeBlockProps {
    /** Force a specific Material icon name, e.g. `icon="react"`. */
    icon?: string
    /** Suppress the file icon for this block. */
    noIcon?: boolean
  }
}
