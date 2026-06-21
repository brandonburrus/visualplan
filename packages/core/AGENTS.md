# packages/core (@visualplan/core)

The single source of truth for the VisualPlan component vocabulary: a zod schema per
component, the enum constants those schemas share, and the `CATALOG` metadata used by the
CLI's `check` and `components` commands. One file: `src/index.ts`.

## Critical Constraints

- **Stay isomorphic.** This module is imported by BOTH the browser runtime (`@visualplan/runtime`,
  for render-time validation) and the Node CLI (`vplan`, for static `check` and the catalog
  printer). It must have **no** React, recharts, or mermaid imports. `zod` is the only dependency.
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
