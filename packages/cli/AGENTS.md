# packages/cli (vplan)

The published package: the `vplan` Node CLI (commander dispatch + the Vite/MDX build that
renders a plan to a self-contained HTML page). Built with tsup to `dist/index.js` (the `bin`).

## Structure

- `src/index.ts` — commander dispatch. `src/commands/` — one file per command (render, check,
  components).
- `src/build/compile.ts` — Vite orchestration for `render` (single-file build via
  `vite-plugin-singlefile`) and `--watch` (dev server). Holds the `rehype-expressive-code` options,
  including two EC plugins: `pluginColorChips` (CSS color swatches) and our own
  `src/build/expressive-code-file-icons.ts` (a Material Icon Theme file-type icon in a titled
  block's header, given `iconClass: 'vp-file-icon'` so `theme.css` can size it). Both inline their
  output at build time, so the single-file invariant holds. `src/build/check.ts` — the static AST
  validator. It also runs each ` ```math ` block through Temml and each ` ```mermaid ` block through
  `beautiful-mermaid`'s `renderMermaidSVG` (the same renderer the runtime `Mermaid` component calls)
  to report bad LaTeX / an unrenderable diagram as `file:line:col`, so `check` and render agree on
  what is renderable (an unsupported type like pie/gantt is caught here instead of as an inline
  error box at render time). `src/build/remark-mermaid.ts` — rewrites ` ```mermaid ` fences to `<Mermaid>`,
  and `src/build/remark-math.ts` — rewrites ` ```math ` fences to `<Math>` by converting the LaTeX
  to MathML with `temml` at build time (no math library ships to the browser); both run BEFORE
  rehype-expressive-code so the highlighter never sees those fences.
- `src/build/expressive-code-file-icons.ts` — our file-icons EC plugin, modeled on
  `@xt0rted/expressive-code-file-icons` but sourcing from `material-icon-theme`. It resolves a
  block's title filename to an icon name through the package's `dist/material-icons.json` manifest
  (exact filename, then longest matching extension, then language, then the default `file`), reads
  the SVG from the package's `icons/`, and inlines it. `iconNameForFile` is exported for unit tests.
- `src/build/plan-blocks.ts` — `parseBlockChildren(name, node)`: turns the markdown children of
  the data components (FileTree, Checklist, Questions, Chart, Compare, Matrix) into the structured
  props their zod schemas expect, plus positioned `issues`. Most parse a markdown list; `Matrix`
  and a multi-series `Chart` parse a GFM `table` (one row per category/dimension), and `parseChart`
  switches on list-vs-table. **Shared by two callers** so render and `check` agree:
  `remark-plan-blocks.ts` (the render remark plugin, uses `value`) and `check.ts` (uses `issues`).
  The remark plugin must run AFTER `remark-gfm` (task-list `checked` state AND tables) and emits the
  data as a JSON-string attribute the component decodes at render. Add a component by appending to
  `CHILD_BLOCK_COMPONENTS` + `BLOCK_DATA_ATTR` and adding a parser; `check` and the plugin pick it up.
- `templates/example.mdx` — exercises every component; used by the integration tests.
- `scripts/vendor.mjs` — the prepack vendoring step.
- `tests/` — check + compile + render (all `// @vitest-environment node`).

## Runtime resolution and vendoring (the load-bearing part)

The runtime is compiled from SOURCE at render time, so the published tarball must physically
contain `@visualplan/runtime` and the `@visualplan/core` it imports. `compile.ts`
`findRuntimePaths()` resolves them in both layouts:

- **Published:** `runtime/` and `core/index.ts` are vendored siblings next to `dist/`. Detected
  by walking up for a dir that has BOTH `runtime/index.html` AND `core/index.ts` (the monorepo
  also has a `runtime/index.html`, but its core is at `core/src/index.ts`, so the two-file check
  disambiguates).
- **Dev (workspace):** resolved via `require.resolve('@visualplan/{runtime,core}/package.json')`.

Either way, the Vite build aliases `@visualplan/core` to the resolved core source and injects the
user's plan via `virtual:plan`. `server.fs.strict` is off because the runtime, core, and plan
span sibling dirs in the monorepo.

The build also aliases `react/jsx-runtime`, `react/jsx-dev-runtime`, and `@mdx-js/react` to the
CLI's own copies (via `require.resolve`). The plan `.mdx` is an external absolute path, so
@mdx-js/rollup's emitted imports would otherwise resolve relative to the plan's own directory,
which usually has no `node_modules` (e.g. a global install rendering `~/plan.mdx`). Without these
aliases, rendering a plan outside a node project fails with "failed to resolve react/jsx-runtime".
Do not remove them.

## Constraints

- `@visualplan/{core,runtime}` are `workspace:*` **devDependencies** here (dev/test/vendor only).
  The real third-party deps the vendored runtime needs at render time are this package's prod
  `dependencies`. `tsup` bundles `@visualplan/core` (`noExternal`) into `dist` for the Node path.
- The vendored `cli/runtime` and `cli/core` are **generated and git-ignored** (written by
  `vendor.mjs`, included in the tarball via `files`). Never edit them; edit the source packages.
- **Publish with `pnpm publish`** so the `workspace:*` protocol is rewritten. `prepack` runs
  `vendor.mjs` then `tsup`.
- The icon/highlighting deps (`material-icon-theme`, `expressive-code-color-chips`,
  `@expressive-code/core`, `hast-util-from-html`) are real prod `dependencies`. `material-icon-theme`
  ships `icons/*.svg` + `dist/material-icons.json`; our plugin resolves the package root via
  `require.resolve('material-icon-theme/package.json')` (it has no `exports` map) and reads them at
  build time, so they resolve wherever the package is installed. This was verified end-to-end through
  the built `dist` (not just the TS source). No pnpm override is needed: owning the plugin lets it
  import the same `@expressive-code/core` (0.43.1) that `rehype-expressive-code` uses.
