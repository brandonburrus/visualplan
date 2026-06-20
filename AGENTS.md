# VisualPlan

A Node CLI that renders a plan written as MDX into a polished, self-contained HTML
page, so Claude can present plans as scannable visuals (diagrams, charts, file-change
maps, option comparisons) instead of walls of terminal text.

## What it does

- `visualplan <file.mdx>` (alias `render`) compiles a plan to a single self-contained
  `<file>.plan.html` and opens it. `--watch` starts a hot-reloading dev server instead;
  `--out <path>` sets the output; `--no-open` suppresses the browser.
- `visualplan check <file.mdx>` validates a plan without rendering (the self-correction
  loop): MDX compile errors plus static component checks, printed as `file:line:col`.
- `visualplan components` prints the component vocabulary cheat-sheet.

Plans use a fixed, tiny component vocabulary (`Phase`, `FileTree`, `Chart`, `Compare`,
`Callout`, and ` ```mermaid ` fences) with no imports — the components are auto-injected
into MDX scope. A plan starts with a `# Title` heading; there is no frontmatter. `Phase`
sections render as a numbered vertical timeline; there is no sidebar.

## Structure

- `src/` — the Node CLI (built with tsup to `dist/index.js`, the `bin`).
  - `index.ts` — commander dispatch. `commands/` — one file per command.
  - `build/compile.ts` — Vite orchestration for render + watch. `build/check.ts` — static validator.
- `runtime/` — the browser/React code, shipped as **source** (see Critical Constraints) and
  compiled at render time by Vite. Components, `Layout.tsx`, `main.tsx` (build entry),
  `index.tsx` (MDX scope + `mount`), `theme.css`.
  - `runtime/shared/catalog.ts` — the component vocabulary's single source of truth.
- `templates/example.mdx` — exercises every component; used by the integration tests.
- `tests/` — component (jsdom), check, and compile (node env) tests.
- `skill/visual-plan/` — the Claude skill teaching the vocabulary (install into `~/.claude/skills`).

## Conventions

- TypeScript ESM, biome (`single` quotes, no semicolons), pnpm. Build: tsup. Tests: vitest.
- Two tsconfigs: `tsconfig.json` (Node CLI, NodeNext) and `tsconfig.runtime.json` (React/DOM/JSX).
  `pnpm typecheck` runs both. `pnpm test` runs vitest. `pnpm check` runs biome.
- No emojis or em/en dashes in code, output, or docs.

## Critical Constraints

- **Render uses Vite with esbuild's automatic JSX and NO `@vitejs/plugin-react`.** This is
  deliberate: plugin-react's babel transform skips `node_modules`, so the shipped runtime
  `.tsx` would fail to compile once the CLI is installed. Vite's `root` is the shipped
  `runtime/` dir and the user's MDX is injected via the `virtual:plan` resolve alias. Do not
  add plugin-react or move the runtime out of the package.
- **`runtime/shared/catalog.ts` is imported by both the browser runtime and the Node CLI.**
  Keep it isomorphic: no React, recharts, or mermaid imports. It is the only place the
  component vocabulary (enums, schemas, catalog) is defined.
- **`check` is static (AST-based).** It validates string-literal enum props (e.g. `status`,
  `type`) and flags unknown components. Complex props (`data`, `files`, `options` arrays) are
  validated at render time by the zod schemas. Do not claim `check` catches every error.
- **Single-file output cannot be verified by scanning for external `<script src>`/`<link>`
  tags** — the React/Vite bundles contain those as JS string literals. Assert the positive
  (inline `<script type="module">` and `<style>` with content) instead.
- Node-side tests (`check`, `compile`) must declare `// @vitest-environment node`; under the
  default jsdom env `import.meta.url` is an `http:` URL and `fileURLToPath` throws.

## Key Decisions

- 2026-06-20: Plans authored as MDX with a fixed ~6-component vocabulary, rendered to a
  self-contained HTML page. Why: visual, scannable plans without per-plan toolchain setup.
- 2026-06-20: Mermaid (one ` ```mermaid ` fence) covers the diagram needs instead of bespoke
  components. Why: text-based, reliable for Claude, one dep covers many shapes.
- 2026-06-20: Diagrams render via `beautiful-mermaid` (`renderMermaidSVG`), replacing the `mermaid`
  package. Why: synchronous and DOM-free, so it renders in SSR/static HTML, themes from our CSS
  vars (no scheme hack), and is far lighter. Tradeoff: no gantt/pie support.
- 2026-06-20: Fenced code is highlighted by `rehype-expressive-code` (build-time), with a
  `remarkMermaid` plugin extracting mermaid fences BEFORE it. Why: file-title frames and dual
  light/dark; the remark step keeps mermaid from being highlighted. Replaced highlight.js.
- 2026-06-20: Icons use `@tabler/icons-react` project-wide (one family). Why: the design standard
  forbids hand-rolled icon paths / text glyphs.
- 2026-06-20: Render with Vite root=`runtime/` + esbuild JSX, MDX via `virtual:plan` alias.
  Why: avoids plugin-react's node_modules transpile gap when the CLI is installed.
