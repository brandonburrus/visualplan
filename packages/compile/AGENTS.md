# packages/compile (@visualplan/compile)

The shared MDX compile pipeline imported by BOTH the `vplan` CLI (Node render path) and the
`/view` page (in-browser compiler), so a plan renders identically whether built locally or
opened from a share link. Holds the remark plugins, the `plan-blocks` markdown-to-props parser,
the Expressive Code options, and the untrusted-input safety gate. Private, never published;
the CLI bundles it into `dist` (tsup `noExternal`) and the app (never published) imports it
through the workspace.

## Critical Constraints

- **The isomorphic entry (`src/index.ts`) must stay browser-safe.** It is imported by the app's
  browser bundle, so it must NOT pull in anything Node-only. In particular it does **not**
  re-export `./file-icons` (which reads SVGs from disk via `material-icon-theme`). The CLI imports
  `@visualplan/compile/file-icons` directly; the browser omits file-type icons by design (the
  package is multi-MB and disk-based). This is the one deliberate render-parity gap.
- **`src/safety-gate.ts` is the security boundary for `/view`.** It parses untrusted MDX to its
  AST (parsing does NOT execute) and rejects anything outside the pure declarative vocabulary:
  import/export, `{ }` expressions, expression/spread/event-handler attributes, non-vocabulary
  JSX (`<script>`, `<img>`, ...), raw HTML, images, and non-http(s)/mailto link URLs. It runs
  BEFORE `evaluate` in the browser compiler. Every forbidden construct has a rejection test and
  the real `example.mdx` has an accept test; never weaken it without adding tests. The sandboxed
  iframe in the app is the second containment layer, so a gap here is contained, not fatal.
- **Render parity is enforced by the module graph, not by hand.** The CLI's `compile.ts` and the
  app's browser compiler both import `remarkPlugins` (ordered list) and `baseExpressiveCodeOptions`
  from here. Changing the plugin list or EC options changes both consumers at once, which is the
  point. After any change, the CLI render must stay byte-stable (render `cli/templates/example.mdx`
  and diff) unless the change is intentional.
- **The `exports` map MUST keep `"./package.json": "./package.json"`** (same Node rule as
  `@visualplan/core`: an `exports` map blocks every unlisted subpath, including `package.json`).

## Layout

- `src/index.ts` — isomorphic barrel (plan-blocks exports, remark plugins, `remarkPlugins`,
  `baseExpressiveCodeOptions`, `assertPlanIsSafe`/`UnsafePlanError`). No file-icons.
- `src/pipeline.ts` — the ordered `remarkPlugins` array (frontmatter, gfm, plan-blocks, mermaid,
  math). Order is load-bearing: plan-blocks/mermaid/math run AFTER remark-gfm, and mermaid/math
  BEFORE the rehype highlighter.
- `src/plan-blocks.ts` — `parseBlockChildren`: markdown children of the data components ->
  structured props + positioned `issues`. Shared by `remark-plan-blocks.ts` (render, uses `value`)
  and the CLI's `check.ts` (uses `issues`), so render and check agree. `parseStat` parses the `Stat`
  block (one `- label: value (intent) -- caption` per item; caption splits on `' -- '`, the trailing
  `(intent)` is validated against `STAT_INTENT_VALUES`). `parseChart` adds shape guards:
  `SINGLE_SERIES_CHARTS` (`pie`, `gauge`, `funnel`, `treemap`) reject a multi-series table, and
  `scatter` requires a table with exactly two value columns (the list form is rejected).
  `parseFileTree` splits a trailing `' -- <note>'` (or a dangling `' --'`) into an optional
  `comment` BEFORE the change/path/move parse, so a comment containing `->` is never read as a move
  arrow; icons are NOT resolved here (that is the CLI-only `remark-filetree-icons` pass).
- `src/remark-plan-blocks.ts` / `remark-mermaid.ts` / `remark-math.ts` — the three custom remark
  plugins. `remark-math` converts LaTeX to MathML with `temml` at build time (isomorphic).
- `src/expressive-code.ts` — `baseExpressiveCodeOptions` (themes, frames, ink styling, color
  chips). NO file-icons plugin (Node-only).
- `src/file-icons.ts` — the Node-only Material file-icons EC plugin (`@visualplan/compile/file-icons`
  subpath). Reads `material-icon-theme`'s manifest + SVGs from disk; `iconNameForFile` (resolution)
  and `fileIconSvg` (resolution + raw SVG markup, cached) are exported. CLI-only.
- `src/remark-filetree-icons.ts` — the Node-only `remarkFileTreeIcons` plugin
  (`@visualplan/compile/filetree-icons` subpath). Runs AFTER `remark-plan-blocks` and inlines a
  `fileIconSvg(basename)` per FileTree entry onto the serialized `files` prop (skipping `/`
  directories). Appended only by the CLI's remark chain, never in the isomorphic `remarkPlugins`,
  so the browser bundle never pulls in `material-icon-theme`.
- `src/safety-gate.ts` — `assertPlanIsSafe(source)`; throws `UnsafePlanError` (carries line/column).
- `tests/` — `plan-blocks`, `file-icons`, and `safety-gate` (node environment).
