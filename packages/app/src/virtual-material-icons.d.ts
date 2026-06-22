/**
 * The build-time clones map emitted by the `materialIconClones` Vite plugin (astro.config.mjs):
 * Material icon names whose SVG file is `<name>.clone.svg` rather than `<name>.svg`, mapped to that
 * actual basename. The `/view` icon loader reads it to avoid bundling the manifest's iconDefinitions.
 */
declare module 'virtual:material-icon-clones' {
  const clones: Record<string, string>
  export default clones
}
