# packages/runtime (@visualplan/runtime)

The browser-side React code that renders a compiled MDX plan. Private package, shipped as
**source** by vendoring it into the published `vplan` CLI tarball (see the root AGENTS.md
"Publishing" section), and compiled at render time by the CLI's Vite build, not prebuilt. See
the root AGENTS.md for why Vite is configured without `@vitejs/plugin-react`.

## How it fits together

- `main.tsx` is the build entry. It imports the user's plan via the `virtual:plan` alias
  (`Plan` default export) and calls `mount`. Plans use no frontmatter; the title is the plan's
  own first `# Heading`, rendered as normal markdown.
- `index.tsx` defines `mount` and the `components` map auto-injected into MDX via `MDXProvider`.
  No plan ever writes an `import` — every component resolves through this map.
- `Layout.tsx` is a single centered content column — no header and no sidebar.
- `Phase` renders as a numbered vertical timeline. The step number comes from a CSS counter
  (`counter-reset: vp-phase` on `.vp-main`, `counter-increment` on `.vp-phase`, number drawn by
  `.vp-phase__node::before`), so phases self-number in document order with no index prop. The
  connector line is a `.vp-phase__rail::after` pseudo-element omitted on the last step.
- `components/` holds the components (Phase, FileTree, Chart, Compare, Callout, Questions,
  Checklist, Mermaid). `FileTree` builds a nested directory tree from flat `{path}` entries
  (collapsing single-child dir chains); `Checklist` renders done/todo acceptance criteria. Each
  validates its props through `validate.ts`
  against the matching zod schema in `@visualplan/core`, throwing a readable, component-named
  error on invalid input (this surfaces in the page and is the render-time half of validation).

## Gotchas

- **Mermaid is rendered by `beautiful-mermaid`**, not the `mermaid` package: `renderMermaidSVG`
  is synchronous and DOM-free, so `Mermaid.tsx` renders the SVG inline during React render (no
  effect, no async) and the diagram appears in the static HTML and SSR output. It is themed via
  our CSS vars, so one SVG adapts to light and dark with no theme detection. Supported diagram
  types: flowchart, sequence, state, class, ER, XY chart. gantt/pie are not supported and throw,
  which the component catches and shows as an inline error.
- **Fenced code is handled at build time, not in a `pre` override.** Two plugins in
  `src/build/compile.ts` cooperate, and ORDER matters: `remarkMermaid` (remark, mdast stage)
  rewrites ` ```mermaid ` fences into `<Mermaid>` JSX FIRST, then `rehype-expressive-code` (rehype
  stage) highlights every remaining code block. Because mermaid is extracted before the
  highlighter runs, the two never collide. Do NOT reorder them, and do NOT route code through a
  React `pre` override again. Expressive Code gives file-title frames (` ```ts title="src/x.ts" `)
  and dual light/dark via `useDarkModeMediaQuery` (github-dark / github-light). Its copy button is
  off (the injected script would not execute in our client-rendered SPA).
- **Icons are Tabler (`@tabler/icons-react`), one family, stroke ~2.** Components render icon
  elements (FileTree change markers + folder, Compare check/x/star, Callout type icon, Questions
  help icon); never hand-roll SVG paths or text glyphs. Icons inherit `currentColor`, so the
  semantic color CSS still drives them.
- **Fullscreen applies to diagrams and charts only (not code).** React surfaces (Mermaid, Chart)
  render `<ExpandButton>` and get the `.vp-expandable` class; `Layout`'s `useEffect` calls
  `initFullscreenControls()`. Code blocks deliberately have no fullscreen.
  `initFullscreenControls` adds a `fullscreenchange` listener that builds a `PanZoom` viewer + the
  toolbar (zoom out / level / zoom in / close). The viewer fits-to-fill and centers the content on
  open, and supports drag-pan, two-finger touch pinch, and trackpad pinch (ctrl + wheel). It uses an
  absolutely-positioned `.vp-fs-content` layer with a `translate() scale()` transform (origin 0,0),
  so zoom-to-cursor math is exact; the zoom % is shown relative to the fit scale (fit = 100%).
- **Expressive Code header is flattened** to a plain filename bar via `.vp-main .expressive-code
  .frame.has-title .header` overrides (the `.vp-main` prefix is required because EC injects its
  `<style>` in the body, after our head styles). Do not remove the prefix.
- **Recharts `Cell` is deprecation-flagged** in recharts 3 but still functional; it is how
  per-bar/slice colors are set. The hint does not fail typecheck.
- **`@visualplan/core` must stay isomorphic** (no React/recharts/mermaid) — the Node CLI
  imports it too. It lives in `packages/core`.
- A side-effect CSS import needs the `*.css` ambient declaration in `css.d.ts`; `virtual:plan`
  needs the ambient module in `virtual-plan.d.ts`.

## Design language (do not regress)

The plan page is a product-register reading surface (Linear/Stripe-clean), not a marketing
page. The rules below are deliberate; changing them needs a reason.

- **Near-monochrome ink accent.** `--vp-accent` is ink (near-black light / near-white dark), not
  a colored brand hue. Chroma is reserved for *semantic* meaning only: done/add green, risk/delete
  red, modify amber, move cyan. Do not introduce a blue/purple accent (the AI-tool reflex).
- **No side-stripe accents.** Callouts use a flat tint plus a full 1px border and a colored label,
  never a `border-left` color stripe (a hard ban).
- **Off-white / off-black only**, never pure `#fff` / `#000`. All colors are CSS vars with a
  `prefers-color-scheme: dark` block; both schemes must stay legible.
- **Mermaid colors come from our CSS vars** (passed to `beautiful-mermaid` as `bg`/`fg`/`line`/
  `accent`/`surface`/`border`), so the diagram tracks the theme automatically. Do not hard-code
  diagram colors or reintroduce scheme detection.
- **Charts are colored** from a shared `COLORS` palette in `Chart.tsx` (vibrant mid-tones that read
  on both surfaces). The pie renders its labels as a custom HTML legend below the chart, not as
  recharts outside labels (those clip against the container). Axis ticks and tooltips are driven by
  CSS vars so dark mode is correct.
- **Callout colors are semantic and distinct:** note (purple), decision (teal), risk (red), warn
  (yellow). Each must stay visually different. `Questions` uses its own blue "needs input" tint.
- **Visual verification:** `playwright-core` (devDep) drives the system Chrome to screenshot a
  rendered `.plan.html` in light and dark. Re-check both schemes after any theme change.

## Adding a component

1. Add its zod schema, enum constants, and a `CATALOG` entry (with `staticEnums` and an
   example) to `@visualplan/core` (`packages/core/src/index.ts`).
2. Create `components/<Name>.tsx` validating props via `validateProps`.
3. Register it in the `components` map in `index.tsx`.
4. Add it to `packages/cli/templates/example.mdx` and cover it in `tests/components.test.tsx`.
