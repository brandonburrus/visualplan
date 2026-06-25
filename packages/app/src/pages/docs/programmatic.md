---
layout: ../../layouts/Docs.astro
title: Programmatic interface
description: Render and validate plans from Node with the vplan API.
---

# Programmatic interface

Besides the [CLI](/docs/cli/), `vplan` exposes a small Node API so a server, a build step, or an
agent harness can render and validate plans in memory instead of shelling out. Install it as a
dependency:

```bash
npm install vplan
```

Everything works on an in-memory MDX **string**, nothing touches the filesystem unless you ask it
to:

```ts
import { renderPlan, checkPlan } from 'vplan'

const source = `# Add rate limiting

<Phase title="Build the limiter" status="active">
  1. Sliding window in Redis
</Phase>
`

const html = await renderPlan(source) // a self-contained HTML string
```

## renderPlan

```ts
renderPlan(source: string, options?: {
  out?: string
  theme?: 'light' | 'dark' | 'system'
  enableSharing?: boolean
}): Promise<string>
```

Compiles a plan's MDX source to a self-contained HTML page and returns it as a string. Pass `out`
to also write the HTML to a file:

```ts
const html = await renderPlan(source)              // string in, string out
await renderPlan(source, { out: 'plan.html' })     // also write a file
```

### Controlling the rendered page

By default the page shows the in-page settings cog (so the viewer can switch theme) and hides the
share button. Two options change that:

- **`theme`** fixes the color scheme. When set, the page renders in that scheme and the settings cog
  is hidden, so the viewer cannot change it (a locked theme also ignores the per-view `localStorage`
  override). When omitted, the page defaults to `system` and shows the cog.
- **`enableSharing`** (default `false`) shows the share button, which copies a
  `visualplan.dev/view?data=...` link encoding the plan. Leave it off for an embedded render that
  should not expose sharing.

```ts
// A fixed dark page with no settings cog and no share button (both defaults for an embed):
const html = await renderPlan(source, { theme: 'dark' })

// Opt back into the share button:
const shareable = await renderPlan(source, { enableSharing: true })
```

`renderPlan` validates the plan first and **throws `InvalidPlanError` if it is invalid**, so a
programmatic caller gets the same self-correction guarantee the CLI has. The error carries the
structured issues:

```ts
import { renderPlan, InvalidPlanError } from 'vplan'

try {
  await renderPlan('# Bad\n\n<Phase status="nope">x</Phase>\n')
} catch (error) {
  if (error instanceof InvalidPlanError) {
    for (const issue of error.issues) {
      console.error(`${issue.line}:${issue.column}  ${issue.message}`)
    }
  }
}
```

## checkPlan

```ts
checkPlan(source: string): Promise<CheckIssue[]>
```

Validates a plan's MDX source without rendering it, returning the issues (an empty array when the
plan is valid). Each issue has a `line`, `column`, and `message`. This runs the static checks
(compile errors, component and enum validation, mermaid and math), the same ones `renderPlan` throws
on. The author-time quality lint (wall of prose, wide diagram, over-long `Matrix` cell, and the like)
runs only on the `vplan check` CLI command, not here:

```ts
const issues = await checkPlan(source)
if (issues.length === 0) {
  // safe to render
}
```

## Component catalog

The component vocabulary is exported as one named descriptor per component, so you can introspect a
single component's props and valid enum values without rendering anything:

```ts
import { chart, phase } from 'vplan'

chart.name // 'Chart'
chart.staticEnums.type // ['bar', 'line', 'area', 'scatter', ...]
phase.staticEnums.status // ['planned', 'active', 'done']
```

The named exports are `phase`, `fileTree`, `chart`, `compare`, `matrix`, `callout`, `questions`,
`checklist`, `stat`, `mermaid`, and `math`. Each is a `CatalogEntry` with a `name`, a `summary`, its
statically-checkable `staticEnums`, and an authoring `example`. See [Authoring
plans](/docs/authoring/) for the full vocabulary.
