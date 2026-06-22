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

## Shared-plan viewer (`/view` + `/plan-frame`)

`/view?data=...` renders a plan shared as a link (the `?data=` the CLI's share button produces).
It compiles the plan's MDX IN THE BROWSER with the same pipeline the CLI uses, so a shared plan
looks like a locally-built one. Untrusted source from a URL is the core risk, handled in layers:

- `src/lib/compile-browser.ts` (`compilePlan`) is the in-browser compiler: it runs the
  `@visualplan/compile` safety gate FIRST (refuses anything but pure plan vocabulary, throwing
  `UnsafePlanError`), then `@mdx-js/mdx` `evaluate` with the shared `remarkPlugins` +
  `rehype-expressive-code`. Heavy, so it is imported lazily (a code-split chunk behind a spinner).
  It sets shiki's `engine: 'javascript'` (no WebAssembly in the browser); this is set ONLY here, not
  in the shared `baseExpressiveCodeOptions`, so the CLI keeps oniguruma and its output stays
  byte-stable. Code-block file-type icons are omitted in the browser (that EC plugin is disk-based
  and Node-only). FileTree file icons, however, ARE shown: `compile-browser.ts` appends
  `remark-filetree-icons-browser.ts` after the shared `remarkPlugins`. That plugin lazily
  `import()`s `file-icons-browser.ts` ONLY when a plan contains a `<FileTree>`, so the icon resolver
  is a code-split chunk no other page pays for. The SVGs are loaded PER ICON via a non-eager
  `import.meta.glob` over `material-icon-theme/icons/*.svg` (one tiny chunk each), so a plan fetches
  only the icon types it uses, not the 5 MB set. Resolution is single-sourced through
  `@visualplan/compile/icon-resolution`, so `/view` and the CLI pick identical icons.
  **Do not reintroduce a reference to the manifest's `iconDefinitions` in `file-icons-browser.ts`:**
  it is 71 KB and Vite tree-shakes it only while it stays unreferenced. The SVG basename is derived
  as `<iconName>.svg`, with the build-time `virtual:material-icon-clones` map (emitted by
  `materialIconClones` in `astro.config.mjs`) covering the ~72 `.clone.svg` icons. That keeps the
  code-split icon chunk ~256 KB instead of ~324 KB.
- `src/lib/render-plan.tsx` wraps the compiled component in the runtime shell (`MDXProvider` +
  `Layout` + `components` + `theme.css`), identical to the CLI's `mount`. The runtime `ShareButton`
  self-hides here (no `__VP_SHARE__`).
- `src/components/PlanFrameApp.tsx` is the contents of the sandboxed `/plan-frame` page: decode,
  512 KB cap, then lazy-compile and mount, with explicit states, a spinner, a calm error card for
  ordinary failures, and the bright `--malicious` card for a gate rejection. Posts its height to the
  parent so the iframe has no inner scrollbar. It seeds `globalThis.__VP_SHARE__` from its own
  `?data=`, so the **runtime** `ShareButton` (rendered by `Layout`) appears inside the frame, the
  same faint top-right control every plan has, rebuilding the `visualplan.dev/view?data=` link.
- `src/components/ViewPage.tsx` is the `/view` host: it embeds `/plan-frame/?data=...` in an
  `<iframe sandbox="allow-scripts">` (NO `allow-same-origin`) and sizes it from the height messages.
  The iframe also gets `allow="clipboard-write"` so the in-frame share button can copy despite the
  opaque-origin sandbox (verified to work). The page has no share control of its own. It **consumes**
  `?data=` on load: the value is stashed in `sessionStorage` and stripped from the address bar
  (`history.replaceState`) so a long link does not linger, while a reload restores the plan from the
  stash. All untrusted compilation happens inside the frame, never on this page.

### Critical constraint: the sandbox depends on GitHub Pages' CORS header

The `/plan-frame` iframe is sandboxed WITHOUT `allow-same-origin`, so it runs in an **opaque origin**
(`origin "null"`). ES module scripts are always fetched in CORS mode, so the frame can only load its
own `_astro/*.js` bundle because **GitHub Pages serves assets with `Access-Control-Allow-Origin: *`**.
This is load-bearing: do not assume same-origin asset loading in the frame, and do not add
`allow-same-origin` to "fix" loading (that would defeat the isolation, since the frame is same-origin
to `/view`). `astro preview` does NOT send that header, so `/view` looks broken there; test the
sandboxed render against `astro build` output served by a static server that sends `ACAO: *` (a
plain Node static server works), not via `astro preview`.

### Why a separate `/plan-frame` page instead of rendering into the iframe

A parent cannot inject React into an opaque-origin iframe (it cannot reach `contentDocument`), so the
frame must be a self-contained page that compiles and mounts itself. That is also what gives the plan
full interactivity (recharts `<Chart>`) inside the sandbox. `/plan-frame` is `noindex`; only `/view`
is a real page (uses `Base`, with a restrictive CSP via its `csp` prop; `Base` gained an opt-in
`csp` prop). `/plan-frame` gets only origin-independent CSP directives, because a `script-src 'self'`
would resolve `'self'` to the opaque origin and block its own assets.

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
