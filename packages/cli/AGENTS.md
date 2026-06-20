# packages/cli (vplan)

The published package: the `vplan` Node CLI (commander dispatch + the Vite/MDX build that
renders a plan to a self-contained HTML page). Built with tsup to `dist/index.js` (the `bin`).

## Structure

- `src/index.ts` — commander dispatch. `src/commands/` — one file per command (render, check,
  components).
- `src/build/compile.ts` — Vite orchestration for `render` (single-file build via
  `vite-plugin-singlefile`) and `--watch` (dev server). `src/build/check.ts` — the static
  AST validator. `src/build/remark-mermaid.ts` — rewrites ` ```mermaid ` fences to `<Mermaid>`
  BEFORE rehype-expressive-code runs.
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
