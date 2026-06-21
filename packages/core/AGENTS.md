# packages/core (@visualplan/core)

The single source of truth for the VisualPlan component vocabulary: a zod schema per
component, the enum constants those schemas share, and the `CATALOG` metadata used by the
CLI's `check` and `components` commands. One file: `src/index.ts`.

## Critical Constraints

- **Stay isomorphic.** This module is imported by BOTH the browser runtime (`@visualplan/runtime`,
  for render-time validation) and the Node CLI (`vplan`, for static `check` and the catalog
  printer). It must have **no** React, recharts, or mermaid imports. `index.ts` depends only on
  `zod`.
- **`src/share.ts` is the stateless-share codec** (`encodePlan`/`decodePlan`: deflate via `fflate`
  + a hand-rolled base64url). It is exposed as the `@visualplan/core/share` subpath (`exports` map)
  and is deliberately NOT re-exported from `index.ts`, so the vendored render path (only `index.ts`
  is vendored) and the runtime's import of `@visualplan/core` stay free of `fflate`. The CLI encodes
  at render time, `/view` decodes in the browser; keep it isomorphic (no Node `Buffer`, no DOM
  `btoa`) so one format serves both. `decodePlan(data, maxBytes?)` takes an optional output cap:
  `/view` passes it because the payload is untrusted, and the decode is then a BOUNDED streaming
  inflate that aborts with `PlanTooLargeError` rather than letting a decompression bomb (DEFLATE can
  expand ~1000x) exhaust memory. The CLI never decodes, so the trusted round-trip omits the cap.
- **The `exports` map MUST keep `"./package.json": "./package.json"`.** Once a package has an
  `exports` map, Node blocks every subpath not listed, including `package.json`. `compile.ts`'s
  `findRuntimePaths` resolves `@visualplan/core/package.json` to locate the core dir in the
  non-vendored (dev/CI) layout, so dropping that entry breaks every render outside the vendored
  tarball, a failure local runs hide whenever stale vendored `cli/core` copies exist.
- The package is private and never published on its own. The CLI bundles it into `dist` (tsup
  `noExternal`) for the Node path, and vendors its source (`-> cli/core/index.ts`) for the Vite
  render path, where it is aliased to `@visualplan/core`. `main`/`types` point at the raw `.ts`
  source because nothing consumes a built artifact.

## Adding to the vocabulary

A new component needs a schema, its enum constants, and a `CATALOG` entry (with `staticEnums`
and an `example`) here, plus a component in `@visualplan/runtime`. `staticEnums` is what
the CLI's AST checker validates statically; everything else is validated at render time by zod.
The schemas describe the **decoded** shape; for the data components the `example` shows the
markdown-children authoring (a bullet/task list, `Compare` headings, or a GFM table for `Matrix`
and a multi-series `Chart`), and the CLI's `plan-blocks.ts` parser is what turns that markdown
into the shape the schema validates.
