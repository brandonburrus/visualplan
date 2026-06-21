# packages/app (@visualplan/app)

The visualplan.dev docs site: a plain Astro static site, hand-built to match the rendered-plan
ink aesthetic. Private (never published); deployed to GitHub Pages on release. This is the only
package that is a web app rather than part of the CLI's render pipeline.

## Structure

- `astro.config.mjs` — `site: https://visualplan.dev` (custom apex domain, so no `base`). Dual-theme
  Shiki (`github-light`/`github-dark`) with `defaultColor: false` for the code blocks.
- `src/layouts/Base.astro` — the HTML document shell (head, meta/OG tags, header, footer). Takes a
  `title` prop; the landing page passes `"Visual Plan"` (no suffix), everything else gets
  `"<title> · Visual Plan"`.
- `src/layouts/Docs.astro` — wraps `Base` with the docs two-column shell (sticky sidebar + prose).
  Markdown docs pages set `layout: ../../layouts/Docs.astro`; their frontmatter arrives under
  `Astro.props.frontmatter` (NOT spread to the top level), so read `title`/`description` from there.
- `src/components/` — `Header.astro` (sticky nav, sets `aria-current` on the active section),
  `Footer.astro`.
- `src/nav.ts` — `docLinks`, the single source of truth for the docs sidebar order.
- `src/pages/index.astro` — the landing page (custom hero + feature grid, uses `Base` directly).
- `src/pages/docs/*` — the docs content: `index.md`, `install.md`, `cli.md`, and `authoring.mdx`
  (MDX, because it embeds live component demos).
- `src/components/Demo.astro` — wraps a live runtime component as a "Renders to" stage (see below).
- `src/nav.ts` — `docLinks` (the Guide sidebar group) and `exampleLinks` (the Examples group, which
  links straight to the rendered example HTML in a new tab).
- `examples/*.mdx` — the source of the linked example plans; rendered to HTML at build (see below).
- `scripts/build-examples.mjs` — the build step that renders `examples/` with the CLI.
- `src/styles/global.css` — all site styles, one stylesheet imported by `Base`.

## Live component demos (the authoring page)

`authoring.mdx` shows each component's MDX source and, beneath it, the **real rendered component**,
via the `react()` + `mdx()` Astro integrations. It deep-imports the runtime components
(`@visualplan/runtime/components/<Name>`, no exports map so subpaths resolve) and wraps each in
`<Demo>`, which loads `@visualplan/runtime/theme.css` and provides a `.vp-main` stage so a `<Phase>`'s
CSS counter numbers correctly.

- **Only `<Chart>` needs `client:only="react"`** (recharts measures the DOM). Everything else,
  including `<Mermaid>` (synchronous, DOM-free, colors are `var(--vp-*)`), renders to static HTML at
  build and stays theme-reactive via CSS. `<Math>` is rendered by converting LaTeX with `temml` in
  the page frontmatter (`temml.renderToString(...)`) and passing the MathML to `MathBlock`.
- The demos live inside the docs `.vp-prose`, so a few prose rules outweigh the plan component
  classes by specificity; `global.css` `.vp-demo` overrides the ones that matter (notably
  `.vp-prose h3` vs `.vp-phase__title`) and hides the dead fullscreen expand button. theme.css must
  load AFTER global.css (it does, via `Demo.astro`) so equal-specificity ties resolve in its favor.
- These deps (`react`, `react-dom`, `recharts`, `beautiful-mermaid`, `@tabler/icons-react`, `zod`,
  `temml`, `@visualplan/{runtime,core}`) are the runtime's own deps, pulled in because the app
  bundles the runtime source; the charts ship recharts (~460 KB) only on pages that use `<Chart>`.

## Example plans

`examples/*.mdx` are full plans authored in the vocabulary. `scripts/build-examples.mjs` renders
each to `public/examples/<slug>.html` with the real `vplan` CLI (`--no-open --out`), so the hosted
examples are authentic and never stale. The output is git-ignored and regenerated on every build;
the app `build` script runs the render step before `astro build`, and **the CLI must be built first**
(`pnpm --filter vplan build`) or the render step exits with an error. The Examples sidebar group
links to these HTML files.
- `public/CNAME` — `visualplan.dev`; Astro copies `public/` to `dist/`, so the custom domain
  binding survives every Pages publish. `public/favicon.svg` is the wordmark mark.

## Conventions and constraints

- **The ink palette is duplicated from `packages/runtime/theme.css`, on purpose.** The runtime ships
  as source compiled per-render and is not importable by the Astro build, so the design tokens
  (`--vp-*`) are copied into `global.css`. If the runtime palette changes, mirror it here so the
  docs site and the pages `vplan` produces stay visually one product.
- **Biome does not process `.astro`, `.svg`, or `.mdx` files** (`files.includes` in the root
  `biome.json` excludes them: Biome has no parser for `.astro`/`.mdx`, and SVG assets are not its
  domain). The `.ts`/`.css`/`.mjs` in this package IS linted and formatted by Biome like the rest of
  the repo. Biome's CSS formatter owns `global.css` (double-quoted strings, multi-line long values)
  and reformats `.mjs` scripts — run `pnpm check` after editing.
- **No `!important` for the Shiki dark-mode swap.** `defaultColor: false` makes Shiki emit only
  `--shiki-light`/`--shiki-dark` CSS vars with no resolved inline color, so `global.css` drives token
  color from those vars and the cascade wins cleanly. Do not reintroduce `!important`.
- `typecheck` is `astro check` (joins the repo's `pnpm -r typecheck`). `build` is `astro build` to
  `dist/` (git-ignored). `dev`/`preview` run the local server.
- No emojis or em/en dashes in content or code.

## Deploy

`.github/workflows/docs.yml` builds the `vplan` CLI (needed by `build-examples.mjs`), then builds
this package and deploys `dist/` to GitHub Pages on `release: published` (tracking CLI releases) and
on manual `workflow_dispatch`. The custom domain must be set in the repo's Pages settings; the
`public/CNAME` file keeps it bound across deploys.
