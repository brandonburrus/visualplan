/**
 * The isomorphic core of Material Icon Theme resolution: a pure function over the parsed manifest,
 * with no filesystem or Node access. The Node side (`file-icons.ts`) loads the manifest from disk
 * and the browser side (the app's `/view` icon chunk) imports it as JSON, but both resolve a file
 * name to an icon name through this single source so the CLI and `/view` pick identical icons.
 */
export interface IconManifest {
  iconDefinitions: Record<string, { iconPath: string }>
  fileNames: Record<string, string>
  fileExtensions: Record<string, string>
  languageIds: Record<string, string>
  /** The icon name used for any file that matches nothing more specific. */
  file: string
}

/**
 * Resolve a file name (with an optional language id and explicit override) to a Material icon name:
 * an exact filename wins, then the longest matching compound extension, then the language, then the
 * default file icon. Pass a basename, not a full path, so an exact filename match (e.g.
 * `package.json`) is not shadowed by a leading path segment.
 */
export function resolveIconName(
  manifest: IconManifest,
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
