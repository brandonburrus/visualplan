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
import { render, check } from 'vplan'

const source = `# Add rate limiting

<Phase title="Build the limiter" status="active">
  1. Sliding window in Redis
</Phase>
`

const html = await render(source) // a self-contained HTML string
```

## render

```ts
render(source: string, options?: { out?: string }): Promise<string>
```

Compiles a plan's MDX source to a self-contained HTML page and returns it as a string. Pass `out`
to also write the HTML to a file:

```ts
const html = await render(source)              // string in, string out
await render(source, { out: 'plan.html' })     // also write a file
```

`render` validates the plan first and **throws `InvalidPlanError` if it is invalid**, so a
programmatic caller gets the same self-correction guarantee the CLI has. The error carries the
structured issues:

```ts
import { render, InvalidPlanError } from 'vplan'

try {
  await render('# Bad\n\n<Phase status="nope">x</Phase>\n')
} catch (error) {
  if (error instanceof InvalidPlanError) {
    for (const issue of error.issues) {
      console.error(`${issue.line}:${issue.column}  ${issue.message}`)
    }
  }
}
```

## check

```ts
check(source: string): Promise<CheckIssue[]>
```

Validates a plan's MDX source without rendering it, returning the issues (an empty array when the
plan is valid). Each issue has a `line`, `column`, and `message`, the same checks the CLI's
`vplan check` runs:

```ts
const issues = await check(source)
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
