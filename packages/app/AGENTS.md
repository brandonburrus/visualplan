# packages/app (@visualplan/app)

The visualplan.dev docs site: a plain Astro static site, hand-built to match the rendered-plan
ink aesthetic. Private (never published); deployed to GitHub Pages on release. This is the only
package that is a web app rather than part of the CLI's render pipeline.

## Structure

- `astro.config.mjs` — `site: https://visualplan.dev` (custom apex domain, so no `base`). Dual-theme
  Shiki (`github-light`/`github-dark`) with `defaultColor: false` for the code blocks.
- `src/layouts/Base.astro` — the HTML document shell (head, meta/OG tags, header, footer). Takes a
  `title` prop; the landing page passes `"VisualPlan"` (no suffix), everything else gets
  `"<title> · VisualPlan"`.
- `src/layouts/Docs.astro` — wraps `Base` with the docs two-column shell (sticky sidebar + prose).
  Markdown docs pages set `layout: ../../layouts/Docs.astro`; their frontmatter arrives under
  `Astro.props.frontmatter` (NOT spread to the top level), so read `title`/`description` from there.
- `src/components/` — `Header.astro` (sticky nav, sets `aria-current` on the active section),
  `Footer.astro`.
- `src/nav.ts` — `docLinks`, the single source of truth for the docs sidebar order.
- `src/pages/index.astro` — the landing page (custom hero + feature grid, uses `Base` directly).
- `src/pages/docs/*.md` — the docs content (`index`, `install`, `authoring`, `cli`).
- `src/styles/global.css` — all site styles, one stylesheet imported by `Base`.
- `public/CNAME` — `visualplan.dev`; Astro copies `public/` to `dist/`, so the custom domain
  binding survives every Pages publish. `public/favicon.svg` is the wordmark mark.

## Conventions and constraints

- **The ink palette is duplicated from `packages/runtime/theme.css`, on purpose.** The runtime ships
  as source compiled per-render and is not importable by the Astro build, so the design tokens
  (`--vp-*`) are copied into `global.css`. If the runtime palette changes, mirror it here so the
  docs site and the pages `vplan` produces stay visually one product.
- **Biome does not process `.astro` or `.svg` files** (`files.includes` in the root `biome.json`
  excludes them: Biome has no `.astro` parser, and SVG assets are not its domain). The `.ts`/`.css`
  in this package IS linted and formatted by Biome like the rest of the repo. Biome's CSS formatter
  owns `global.css` (double-quoted strings, multi-line long values) — run `pnpm check` after editing.
- **No `!important` for the Shiki dark-mode swap.** `defaultColor: false` makes Shiki emit only
  `--shiki-light`/`--shiki-dark` CSS vars with no resolved inline color, so `global.css` drives token
  color from those vars and the cascade wins cleanly. Do not reintroduce `!important`.
- `typecheck` is `astro check` (joins the repo's `pnpm -r typecheck`). `build` is `astro build` to
  `dist/` (git-ignored). `dev`/`preview` run the local server.
- No emojis or em/en dashes in content or code.

## Deploy

`.github/workflows/docs.yml` builds this package and deploys `dist/` to GitHub Pages on
`release: published` (tracking CLI releases) and on manual `workflow_dispatch`. The custom domain
must be set in the repo's Pages settings; the `public/CNAME` file keeps it bound across deploys.
