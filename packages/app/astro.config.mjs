import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import mdx from '@astrojs/mdx'
import react from '@astrojs/react'
import { defineConfig } from 'astro/config'

/**
 * Emit a virtual module with the Material icon "clones": the ~72 icons whose SVG file name is NOT
 * `<iconName>.svg` (they end in `.clone.svg`). The `/view` icon loader derives every other basename
 * as `<iconName>.svg`, so importing this tiny map (~2 KB) lets it avoid pulling the manifest's 71 KB
 * `iconDefinitions` table into the code-split icon chunk, cutting it by ~22%. The map is computed
 * from the installed manifest at build time, so it never drifts from the package version.
 */
function materialIconClones() {
  const VIRTUAL_ID = 'virtual:material-icon-clones'
  const RESOLVED_ID = `\0${VIRTUAL_ID}`
  const require = createRequire(import.meta.url)
  return {
    name: 'visualplan:material-icon-clones',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null
    },
    load(id) {
      if (id !== RESOLVED_ID) return null
      const manifestPath = require.resolve('material-icon-theme/dist/material-icons.json')
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const clones = {}
      for (const [name, definition] of Object.entries(manifest.iconDefinitions)) {
        const basename = definition.iconPath.split('/').pop()
        if (basename !== `${name}.svg`) clones[name] = basename
      }
      return `export default ${JSON.stringify(clones)}`
    },
  }
}

// visualplan.dev is a custom apex domain served by GitHub Pages, so the site
// roots at `/` (no `base`). `site` is the canonical origin used for absolute
// URLs (sitemap, canonical links). The deploy ships `public/CNAME` to keep the
// custom domain bound on each Pages publish.
export default defineConfig({
  site: 'https://visualplan.dev',
  // react() renders the @visualplan/runtime plan components (Chart hydrates as an island);
  // mdx() lets the authoring page mix prose, code samples, and live component demos.
  integrations: [react(), mdx()],
  vite: {
    plugins: [materialIconClones()],
    // `@visualplan/runtime` is a workspace package consumed as source, so without this the dev
    // server can resolve a second React copy for its deep-imported components (the interactive
    // review demo mounts many at once), triggering an "invalid hook call" / `useState` of null.
    // The production build already dedupes via Rollup; this makes dev match it.
    resolve: { dedupe: ['react', 'react-dom'] },
  },
  markdown: {
    // Dual-theme Shiki to match the rendered-plan highlighting (github light/dark).
    // `defaultColor: false` emits only `--shiki-light` / `--shiki-dark` CSS vars
    // (no resolved inline color), so global.css drives token color from them and
    // swaps to dark under the dark scheme without needing `!important`.
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
    },
  },
})
