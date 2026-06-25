# packages/cli (vplan)

The published package. It ships two entrypoints: the `vplan` CLI (commander dispatch + the Vite/MDX
build that renders a plan to a self-contained HTML page) at `dist/index.js` (the `bin`), and a
programmatic Node API at `dist/api.js` (the package's `import` entry, `exports["."]`).

## Structure

- `src/index.ts` — commander dispatch (the `bin`). `src/commands/` — one file per command (render,
  check, components, config, share). `config` is a parent command: bare `config` shows the settings
  + path, `config get <key>` / `config set <key> <value>` / `config path` are subcommands. Invalid
  key/value throws, which the top-level catch turns into a stderr message + exit 1.
- `src/commands/input.ts` — `readPlanSource(file?)`, the shared input layer for `render` and
  `share`. Returns the MDX source plus a diagnostics `label` and a `fromStdin` flag. Reads stdin when
  the arg is `-` or (no arg given) stdin is piped (`!process.stdin.isTTY`); a bare invocation on an
  interactive terminal throws rather than hang. `render` routes stdin output to stdout by default,
  and `--stdout`/`--out`/`--watch`/`--review` have mutual-exclusion guards (watch needs a real file
  to re-read; review is a server, not a file output).
- `src/review/` — interactive review mode (`--review`). `session.ts` `runReview` serves the plan via
  `startReviewServer`, opens it, and races `server.feedback` against `--timeout` (`ms`-parsed); it
  prints the feedback to **stdout** (the agent reads it) and status to **stderr**, sets the exit code
  from the outcome, and handles Ctrl+C (close + exit 130). `format.ts` is the pure formatter
  (`formatFeedback` -> readable text, `exitCodeFor`: approve 0 / deny 1 / iterate 2 / timeout 3). The
  transport lives in `compile.ts` `startReviewServer`: a one-shot Vite server over a frozen snapshot
  (a string input, so no watch/hot-reload, which is what lets the page collect comments without
  re-rendering) that injects `__VP_REVIEW__` and exposes three endpoints, all settling the session
  once: `POST /__vp_feedback` (the explicit decision, validated against `@visualplan/core`'s
  `feedbackSchema`), `POST /__vp_draft` (the page keeps the Deny-on-close payload current as comments
  are added), and `GET /__vp_alive` (a connection the page holds open; its drop resolves Deny with the
  latest draft). Detecting that socket close server-side is what makes a real tab close reliable,
  where an unload-time `sendBeacon` is not (verified: the beacon survives navigation but not a close).
- `src/build/snapshots.ts` — the per-plan snapshot cache (`~/.vplan/snapshots`, keyed by a hash of
  the plan's absolute path) powering automatic iteration diffing. `render` reads a plan path's
  snapshot as the diff baseline, then overwrites it with the current source ("changes since you last
  looked"). Best-effort: a read miss or write failure just means no diff, never a broken render.
  Baseline resolution (`render.ts resolveBaseline`): explicit `--diff <path>` wins and does NOT touch
  the cache; `--no-diff` (`diff === false`) disables both read and write; otherwise a file render
  auto-diffs against (and refreshes) the snapshot. stdin (no path key) and `--stdout` (kept
  deterministic) never auto-diff. The diff itself is injected by `compile.ts planDiffPlugin`
  (`__VP_DIFF__`, mirroring `planSharePlugin`) when `BuildOptions.baseline` is set, shared by the
  one-shot build, `--watch`, and `--review`.
- `src/config.ts` — the persistent CLI config at `~/.vplan/config.json` (literal path via
  `homedir()`, deliberately NOT `env-paths`). Only setting today is `theme` (`light`|`dark`|
  `system`). `readConfig` is tolerant (missing/malformed/unknown-theme -> `{ theme: 'system' }`) so a
  hand-broken config never breaks a render; `writeConfig` backs `config set`. The render command
  reads it and passes the theme into the build; the rendered plan's in-page cog overrides per-view
  via `localStorage` and never writes back here. `readConfig`/`writeConfig`/`configFilePath` and the
  `runConfig*` command fns all take an optional `dir` so tests point at a temp directory instead of
  the real home.
- `src/api.ts` — the programmatic API (the library entry): `renderPlan(source, { out?, theme?,
  enableSharing? })` (returns the HTML string, throws `InvalidPlanError` on an invalid plan, optional
  file write), `checkPlan(source)`, and one named re-export per catalog entry from `@visualplan/core`
  (`phase`, `chart`, ...). The API view options differ from the CLI defaults on purpose: a set
  `theme` LOCKS the scheme (hides the cog, ignores the `localStorage` override) via `lockTheme`, and
  `enableSharing` defaults to **false** (the CLI always shares). They map to `buildHtml`'s
  `BuildOptions`. `Theme` is re-exported for consumers. It is source-string based on purpose: rendering a file is
  `renderPlan(await readFile(path, 'utf8'))`, which avoids a path-vs-source overload. It wraps the
  same `buildHtml`/`checkSource` the CLI uses. (NB: the API `checkPlan` is source-based; the internal
  `build/check.ts checkPlan` is the file-path-based wrapper, a different signature.)
- `src/build/compile.ts` — Vite orchestration. `buildHtml(source)` is the shared core: it compiles
  a plan from an in-memory MDX **string** and returns the self-contained HTML (single-file build via
  `vite-plugin-singlefile`). `renderToFile(path, out)` reads the file once and delegates; the API's
  `render` passes its source straight through, so nothing is written to disk except the optional
  output. The plan is served as the `virtual:plan` module by `virtualPlanPlugin`, which compiles the
  source with `@mdx-js/mdx` `compile()` (the shared remark/rehype config in `mdxCompileOptions`) and
  returns the module whose default export is the MDX component, matching `runtime/virtual-plan.d.ts`.
  This single plugin replaced the old `virtual:plan` path alias AND `@mdx-js/rollup` (the plan is the
  only `.mdx`), so the one-shot build and `--watch` share ONE compile path and cannot drift. For
  `--watch`, `startDevServer(path)` passes `{ path }`; the plugin re-reads the file in `load`.
  **Content-aware bundling:** `buildHtml` adds `stubUnusedRenderersPlugin`, which scans the plan
  source and replaces the heavy renderers it does not author with a `() => null` stub at the component
  boundary (`./components/<Name>.js`), dropping the dep subtree from the single-file output: no
  ` ```mermaid ` fence stubs `Mermaid` (cuts beautiful-mermaid + elkjs, ~1.5MB), no `<Chart` stubs
  `Chart` (cuts recharts, ~450KB). A renderer-free plan is ~320KB vs the ~2.3MB full bundle. The
  per-renderer regexes (`STUBBABLE_RENDERERS`) **must stay biased toward inclusion** (a false positive
  only costs bytes; a miss drops a renderer the plan uses and breaks it). It is added ONLY in
  `buildHtml`, never in `baseConfig`/`startDevServer`, because a `--watch` plan can add a diagram or
  chart after the bundle's renderers were chosen; do not move it into the shared config.
  **HMR gotcha:** the plan is now a virtual module backed by a file, not a real module Vite tracks by
  path, so `addWatchFile` alone does NOT invalidate it on a save (verified: it only adds the file to
  the watcher). The plugin's `handleHotUpdate` is what drives `--watch`: on a change to the plan it
  invalidates the virtual module and sends a `full-reload`. Do not drop it, or editing a watched plan
  silently stops reloading. `planSharePlugin` encodes the plan's MDX
  (`@visualplan/core/share` `encodePlan`) and injects it onto `globalThis.__VP_SHARE__` for the
  runtime share button; on the dev server it also serves `/__vp_share`, which re-encodes the file on
  each request so a watched plan shares its current state. Imports the shared remark plugins and
  `baseExpressiveCodeOptions` from `@visualplan/compile` (so the CLI and `/view` highlight
  identically), and appends the Node-only `@visualplan/compile/file-icons` plugin (a Material Icon
  Theme file-type icon in a titled block's header, `iconClass: 'vp-file-icon'` so `theme.css` can
  size it). It also appends the Node-only `remarkFileTreeIcons` (`@visualplan/compile/filetree-icons`)
  to the remark chain, which inlines a Material file-type icon per `<FileTree>` entry; both are
  CLI-only so the browser bundle never loads `material-icon-theme`. Color chips and file icons both inline their output at build time, so the single-file
  invariant holds. `buildHtml(source, BuildOptions)` is the shared core; `BuildOptions` is `{ theme,
  lockTheme, enableSharing }` (defaults `system` / false / true = the CLI's behavior).
  `renderToFile`/`startDevServer` keep a `theme` param and pass `{ theme }`. `planConfigPlugin`
  injects a tiny non-module `<head>` script (`themeBootstrap`) that seeds `globalThis.__VP_CONFIG__`
  (`{ theme, lockTheme }`) and sets `<html data-theme>` before first paint, so a configured dark plan
  has no light flash. When `lockTheme` the bootstrap uses the theme directly (ignores localStorage);
  otherwise localStorage `vp-theme` -> injected default -> `system`. `planSharePlugin` is only added
  when `enableSharing`, so omitting it leaves the runtime `ShareButton` with no data to render. The
  bootstrap's resolution + lock behavior MUST stay in sync with the runtime's `theme.ts`.
  `src/build/check.ts` — the static AST
  validator. It also runs each ` ```math ` block through Temml and each ` ```mermaid ` block through
  `beautiful-mermaid`'s `renderMermaidSVG` (the same renderer the runtime `Mermaid` component calls)
  to report bad LaTeX / an unrenderable diagram as `file:line:col`, so `check` and render agree on
  what is renderable (an unsupported type like pie/gantt is caught here instead of as an inline
  error box at render time). It also rejects markdown images (`![](url)`), which would compile to a
  live `<img>` and break the self-contained output. It imports `CHILD_BLOCK_COMPONENTS`
  and `parseBlockChildren` from `@visualplan/compile` so its static checks agree with what render
  parses. `CheckIssue` carries an optional `severity` (absent = `error`); the syntax checks here omit
  it, the quality lint emits `warn`. Both fail `check`; severity only changes the printed label.
- `src/build/lint.ts` — the author-time quality lint, run by the `check` COMMAND (not `checkSource`,
  so `render`/`share`/the API never block a stylistically-weak-but-valid plan from rendering). The
  `check` command runs the syntax check first and only lints when it passes clean, so lint warnings
  never bury a real error and the lint parse never sees malformed MDX. Rules flag the visual-plan
  skill's "tell, don't show" mistakes (wall-of-prose Phase, all-prose plan, wide LR mermaid, long
  Matrix cell, commented FileTree move row, multi-series chart with mismatched scales). Every rule's
  threshold is a named constant at the top of the file for calibration; the chart rule compares
  per-series peaks (NOT global min/max) so a single series ramping along its category axis is never
  flagged. A lint `warn` fails `check` (exit 1) like an error.
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
CLI's own copies (via `require.resolve`). The compiled `virtual:plan` module imports those, but it
is a virtual module with no directory of its own (and a file plan often lives outside any node
project, e.g. a global install rendering `~/plan.mdx`), so without these aliases they resolve
relative to nothing and rendering fails with "failed to resolve react/jsx-runtime". Do not remove
them. The `tests/compile.test.ts` "renders a plan outside any node project" case guards this.

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
- **`tsup.config.ts` is two configs, not one.** The CLI bin (`src/index.ts`) needs the
  `#!/usr/bin/env node` shebang banner; the library entry (`src/api.ts`) must NOT carry it (it would
  be a stray line atop an imported module) and needs `.d.ts` types the bin does not. They cannot
  share one pass, so the bin config has the banner + `clean: true` and the library config has
  `dts: { resolve: [/^@visualplan\//] }` + `clean: false`. The `dts.resolve` is load-bearing:
  without it tsup leaves the catalog re-exports as `from '@visualplan/core'` (a private package a
  consumer lacks), breaking the published types; `resolve` inlines the `@visualplan` types while
  leaving third-party ones (zod) as ordinary imports. The library config must not clean, or it wipes
  the bin tsup built first.
- The package has an `exports` map (`"."` -> the library `dist/api.js` + `dist/api.d.ts`) alongside
  the `bin`. Keep `"./package.json": "./package.json"` in it: an `exports` map blocks every unlisted
  subpath, and dropping it would break tooling that resolves the package's `package.json`.
- `tsup` `noExternal` is the regex `/^@visualplan\/(core|compile)/` (not a bare string) so it also
  bundles the `@visualplan/core/share` and `@visualplan/compile/file-icons` subpaths that
  `compile.ts` imports. The compile package's own third-party deps (rehype-expressive-code,
  material-icon-theme, remark-*, ...) stay external and ship installed as this package's prod
  `dependencies`; `fflate` (the codec's dep) likewise.
- **Publish with `pnpm publish`** so the `workspace:*` protocol is rewritten. `prepack` runs
  `vendor.mjs` then `tsup`.
- **The quality lint (`build/lint.ts`) runs in the `check` COMMAND only, never in `checkSource`.**
  `render`/`share`/the public API must keep rendering a stylistically-weak-but-valid plan (the point
  is to SEE it). A lint `warn` fails `check` (exit 1): deliberately NO advisory mode and NO `--strict`
  flag, so a weak plan blocks. Don't move lint into `checkSource` or add an advisory/`--strict` mode
  without a deliberate reversal. Thresholds are calibrated against an eval corpus (precision-first,
  since a warn blocks); chart-magnitude is held high on purpose so a legit ~40x stacked ramp is not
  flagged.
- The icon/highlighting deps (`material-icon-theme`, `expressive-code-color-chips`,
  `@expressive-code/core`, `hast-util-from-html`) are real prod `dependencies` (also declared by
  `@visualplan/compile`, which owns the plugins now). `material-icon-theme` ships `icons/*.svg` +
  `dist/material-icons.json`; the file-icons plugin (`@visualplan/compile/file-icons`, bundled into
  `dist`) resolves the package root via `require.resolve('material-icon-theme/package.json')` (it
  has no `exports` map) and reads them at build time, so they resolve wherever the package is
  installed. Verified end-to-end through the built `dist` (not just the TS source). No pnpm override
  is needed: owning the plugin lets it import the same `@expressive-code/core` (0.43.1) that
  `rehype-expressive-code` uses.
