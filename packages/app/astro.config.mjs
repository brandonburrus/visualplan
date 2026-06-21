import mdx from '@astrojs/mdx'
import react from '@astrojs/react'
import { defineConfig } from 'astro/config'

// visualplan.dev is a custom apex domain served by GitHub Pages, so the site
// roots at `/` (no `base`). `site` is the canonical origin used for absolute
// URLs (sitemap, canonical links). The deploy ships `public/CNAME` to keep the
// custom domain bound on each Pages publish.
export default defineConfig({
  site: 'https://visualplan.dev',
  // react() renders the @visualplan/runtime plan components (Chart hydrates as an island);
  // mdx() lets the authoring page mix prose, code samples, and live component demos.
  integrations: [react(), mdx()],
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
