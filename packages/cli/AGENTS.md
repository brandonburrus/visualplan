# packages/cli (vplan)

The published package: the `vplan` Node CLI (commander dispatch + the Vite/MDX build that
renders a plan to a self-contained HTML page). Built with tsup to `dist/index.js` (the `bin`).

## Structure

- `src/index.ts` — commander dispatch. `src/commands/` — one file per command (render, check,
  components).
- `src/build/compile.ts` — Vite orchestration for `render` (single-file build via
  `vite-plugin-singlefile`) and `--watch` (dev server). `planSharePlugin` encodes the plan's MDX
  (`@visualplan/core/share` `encodePlan`) and injects it onto `globalThis.__VP_SHARE__` for the
  runtime share button; on the dev server it also serves `/__vp_share`, which re-encodes the file on
  each request so a watched plan shares its current state. Imports the shared remark plugins and
  `baseExpressiveCodeOptions` from `@visualplan/compile` (so the CLI and `/view` highlight
  identically), and appends the Node-only `@visualplan/compile/file-icons` plugin (a Material Icon
  Theme file-type icon in a titled block's header, `iconClass: 'vp-file-icon'` so `theme.css` can
  size it). It also appends the Node-only `remarkFileTreeIcons` (`@visualplan/compile/filetree-icons`)
  to the remark chain, which inlines a Material file-type icon per `<FileTree>` entry; both are
  CLI-only so the browser bundle never loads `material-icon-theme`. Color chips and file icons both inline their output at build time, so the single-file
  invariant holds. `src/build/check.ts` — the static AST
  validator. It also runs each ` ```math ` block through Temml and each ` ```mermaid ` block through
  `beautiful-mermaid`'s `renderMermaidSVG` (the same renderer the runtime `Mermaid` component calls)
  to report bad LaTeX / an unrenderable diagram as `file:line:col`, so `check` and render agree on
  what is renderable (an unsupported type like pie/gantt is caught here instead of as an inline
  error box at render time). It also rejects markdown images (`![](url)`), which would compile to a
  live `<img>` and break the self-contained output. It imports `CHILD_BLOCK_COMPONENTS`
  and `parseBlockChildren` from `@visualplan/compile` so its static checks agree with what render
  parses.
- The remark plugins (`remark-mermaid`, `remark-math`, `remark-plan-blocks`), the `plan-blocks`
  parser, the Expressive Code options, and the Material file-icons plugin now live in
  `packages/compile` (`@visualplan/compile`), shared with the `/view` browser compiler so both
  render plans identically. See that package's AGENTS.md. `compile.ts` imports `remarkPlugins` +
  `baseExpressiveCodeOptions` from it and the Node-only file-icons from the `/file-icons` subpath.
  To add a data component, edit `@visualplan/compile` (`CHILD_BLOCK_COMPONENTS` + `BLOCK_DATA_ATTR`
  + a parser); `check` and the render plugin both pick it up.
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

- `@visualplan/{core,compile,runtime}` are `workspace:*` **devDependencies** here (dev/test/vendor
  only). The real third-party deps the vendored runtime AND the bundled `compile` code need at
  render time are this package's prod `dependencies`. `tsup` bundles `@visualplan/{core,compile}`
  (`noExternal`) into `dist` for the Node path.
- The vendored `cli/runtime` and `cli/core` are **generated and git-ignored** (written by
  `vendor.mjs`, included in the tarball via `files`). Never edit them; edit the source packages.
  **Gotcha:** if these dirs exist during local dev, `findRuntimePaths` prefers them over the
  workspace source, so a stale copy silently shadows your runtime/core edits at render time. After
  changing the runtime or core, re-vendor (`pnpm --filter vplan vendor`) or remove `cli/runtime` +
  `cli/core` so renders pick up the workspace source again.
- `tsup` `noExternal` is the regex `/^@visualplan\/(core|compile)/` (not a bare string) so it also
  bundles the `@visualplan/core/share` and `@visualplan/compile/file-icons` subpaths that
  `compile.ts` imports. The compile package's own third-party deps (rehype-expressive-code,
  material-icon-theme, remark-*, ...) stay external and ship installed as this package's prod
  `dependencies`; `fflate` (the codec's dep) likewise.
- **Publish with `pnpm publish`** so the `workspace:*` protocol is rewritten. `prepack` runs
  `vendor.mjs` then `tsup`.
- The icon/highlighting deps (`material-icon-theme`, `expressive-code-color-chips`,
  `@expressive-code/core`, `hast-util-from-html`) are real prod `dependencies` (also declared by
  `@visualplan/compile`, which owns the plugins now). `material-icon-theme` ships `icons/*.svg` +
  `dist/material-icons.json`; the file-icons plugin (`@visualplan/compile/file-icons`, bundled into
  `dist`) resolves the package root via `require.resolve('material-icon-theme/package.json')` (it
  has no `exports` map) and reads them at build time, so they resolve wherever the package is
  installed. Verified end-to-end through the built `dist` (not just the TS source). No pnpm override
  is needed: owning the plugin lets it import the same `@expressive-code/core` (0.43.1) that
  `rehype-expressive-code` uses.
