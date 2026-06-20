# VisualPlan

A pnpm monorepo for `vplan`: a Node CLI that renders a plan written as MDX into a
polished, self-contained HTML page, so Claude can present plans as scannable visuals
(diagrams, charts, file-change maps, option comparisons) instead of walls of terminal text.

## What it does

- `vplan <file.mdx>` (alias `render`) compiles a plan to a single self-contained
  `<file>.plan.html` and opens it. `--watch` starts a hot-reloading dev server instead;
  `--out <path>` sets the output; `--no-open` suppresses the browser.
- `vplan check <file.mdx>` validates a plan without rendering (the self-correction
  loop): MDX compile errors plus static component checks, printed as `file:line:col`.
- `vplan components` prints the component vocabulary cheat-sheet.

Plans use a fixed, tiny component vocabulary (`Phase`, `FileTree`, `Chart`, `Compare`,
`Callout`, `Questions`, `Checklist`, and ` ```mermaid ` fences) with no imports — the
components are auto-injected into MDX scope. A plan starts with a `# Title` heading; there
is no frontmatter. `Phase` sections render as a numbered vertical timeline; no sidebar.

## Workspace layout

`pnpm-workspace.yaml` globs `packages/*`. Three packages, one published:

- `packages/cli` — **the only published package** (`vplan`). The Node CLI (commander
  dispatch + Vite/MDX build), built with tsup to `dist/index.js` (the `bin`). Holds
  `templates/example.mdx` (used by the integration tests) and `scripts/vendor.mjs`.
- `packages/runtime` — `@visualplan/runtime` (private). The browser/React code, shipped as
  **source** and compiled at render time by Vite. Components, `Layout.tsx`, `main.tsx`,
  `index.tsx` (MDX scope + `mount`), `theme.css`, `fullscreen.ts`.
- `packages/core` — `@visualplan/core` (private). The isomorphic component vocabulary
  (zod schemas + `CATALOG`); imported by both the runtime and the CLI.
- `skill/visual-plan/` — the Claude skill (a top-level sibling, not a package).

## Publishing (single package, vendored)

Only `vplan` is published; `core` and `runtime` are private and **vendored** into the
tarball, because the runtime is compiled from source at render time and must physically ship.

- `cli` depends on the third-party packages the vendored runtime needs at render time
  (react, recharts, beautiful-mermaid, tabler, mdx, vite, ...) as real `dependencies`, and
  references `@visualplan/{core,runtime}` only as `workspace:*` **devDependencies**.
- `tsup` bundles `@visualplan/core` into `dist/` (`noExternal`) for the Node check/components
  path. `compile.ts` resolves the runtime in dev (workspace) or prod (vendored) and aliases
  `@visualplan/core` to the core source in the Vite build either way.
- `prepack` runs `scripts/vendor.mjs` (copies `packages/runtime` -> `cli/runtime` and the core
  entry -> `cli/core/index.ts`, both git-ignored) then `tsup`. `files` ships `dist`, `runtime`,
  `core`. **Publish with `pnpm publish` (from `packages/cli`)** so the `workspace:*` protocol is
  rewritten; plain `npm publish` would leave it literal.

## Conventions

- TypeScript ESM, biome (`single` quotes, no semicolons), pnpm. Build: tsup. Tests: vitest.
- `tsconfig.base.json` holds shared strict options; each package extends it with its own
  `tsconfig.json` (core/cli are NodeNext, runtime is Bundler + DOM/JSX). `pnpm typecheck`
  runs `tsc` in every package. `pnpm test` runs one vitest config with a project per package.
  `pnpm check` runs biome. `pnpm build` builds the CLI.
- No emojis or em/en dashes in code, output, or docs.

## Critical Constraints

- **Render uses Vite with esbuild's automatic JSX and NO `@vitejs/plugin-react`.** This is
  deliberate: plugin-react's babel transform skips `node_modules`, so the shipped runtime
  `.tsx` would fail to compile once the CLI is installed. Vite's `root` is the runtime dir and
  the user's MDX is injected via the `virtual:plan` resolve alias. Do not add plugin-react.
- **`@visualplan/core` is imported by both the runtime and the Node CLI.** Keep it isomorphic:
  no React, recharts, or mermaid imports. It is the only place the vocabulary is defined.
- **`check` is static (AST-based).** It validates string-literal enum props and flags unknown
  components; complex array props are validated at render time by zod. Do not overclaim it.
- **Single-file output cannot be verified by scanning for external `<script src>`/`<link>`
  tags** — the bundles contain those as JS string literals. Assert the positive (inline
  `<script type="module">` and `<style>` with content) instead.
- Node-side tests (`check`, `compile`, `render`) declare `// @vitest-environment node`; under
  jsdom `import.meta.url` is an `http:` URL and `fileURLToPath` throws.
- **The vendored `cli/runtime` and `cli/core` are generated** (git-ignored, written by
  `vendor.mjs`). Never edit them; edit `packages/runtime` / `packages/core` and re-vendor.

## Key Decisions

- 2026-06-20: Plans authored as MDX with a fixed component vocabulary, rendered to a
  self-contained HTML page. Why: visual, scannable plans without per-plan toolchain setup.
- 2026-06-20: Mermaid (one ` ```mermaid ` fence) covers diagrams instead of bespoke components.
  Why: text-based, reliable for Claude, one dep covers many shapes.
- 2026-06-20: Diagrams render via `beautiful-mermaid` (`renderMermaidSVG`). Why: synchronous,
  DOM-free (renders in static HTML), themes from our CSS vars. Tradeoff: no gantt/pie.
- 2026-06-20: Fenced code highlighted by `rehype-expressive-code` (build-time), with a
  `remarkMermaid` plugin extracting mermaid fences BEFORE it. Why: file-title frames + dual
  light/dark; the remark step keeps mermaid out of the highlighter. Replaced highlight.js.
- 2026-06-20: Icons use `@tabler/icons-react` project-wide. Why: design standard forbids
  hand-rolled icon paths / text glyphs.
- 2026-06-20: Monorepo with one published package (`vplan`); `core` and `runtime` are
  private and vendored into the tarball at pack time. Why: the runtime ships as source, so a
  single self-contained published package must physically contain it; the split keeps the
  catalog and React surface as their own units without three npm entries.
- 2026-06-20: Published npm name and CLI command are `vplan`, not `visualplan`. Why: npm's
  similarity filter rejects `visualplan` as too close to the existing `visual-plan` package.
  The product display name (VisualPlan) and the private `@visualplan/*` scope are unaffected.
