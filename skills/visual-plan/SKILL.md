---
name: visual-plan
description: Always use when planning anything non-trivial (an implementation, design, refactor, or migration), as the default and better way to show your plan visually instead of as a wall of text, especially in plan mode. Authors the plan as an MDX file and renders it to a self-contained HTML page with the `vplan` CLI, using a fixed component vocabulary. Also use when the user says "make a visual plan", "render this plan", "show me the plan", or asks for a plan with diagrams/charts. Skip only for trivial one-step changes or prose-only notes.
---

# Visual Plan

Render a plan as a visual MDX page instead of a wall of text, using the `vplan` CLI.

> **If the `vplan` command is not found**, install it globally first: `npm i -g vplan@latest`
> (published on npm). Re-run the failed command afterward.

## Workflow

1. Write the plan to a `.mdx` file. Start with a `# Title` heading (no frontmatter), then use
   the components below. You never write `import` statements; the components are always in scope.
2. Validate before showing the user: `vplan check <file>.mdx`. Fix any reported
   `file:line:col` issues (it names the valid values for bad enums and flags unknown components).
3. Render: `vplan <file>.mdx` writes a self-contained `<file>.plan.html` next to the source and
   opens it. Pass `--no-open` to skip the browser, `--out <path>` to set the output location, or
   `--watch` to start a live-reloading dev server while you refine the plan.

Run `vplan components` anytime for the exact prop signatures.

## Title

Begin the file with a single `# Heading`; it becomes the plan title. There is no frontmatter.

```mdx
# Add rate limiting to the API
```

## Components

The data components (`FileTree`, `Chart`, `Compare`, `Matrix`, `Questions`, `Checklist`) take
their data as **markdown children**, not props: write a normal markdown list (or, for `Matrix`
and a multi-series `Chart`, a markdown table) between the tags. Only the scalar settings
(`title`, `type`, `status`) are attributes. This is fewer tokens and avoids the `{[{ ... }]}`
brace errors that break a render.

- `<Phase title="..." status="planned|active|done">` — one step in a numbered vertical
  timeline; wraps markdown (ordered lists, prose, nested components). The steps auto-number in
  order. One per major step of the plan.
- ` ```mermaid ` fenced block — diagrams: architecture (`flowchart`), `sequenceDiagram`,
  dependency graphs, `stateDiagram-v2`, `classDiagram`, and ER charts. Reach for this first for
  anything structural. (gantt and pie are not supported; use `<Chart>` for quantitative data.)
- ` ```math ` fenced block — a display formula written in LaTeX, typeset as math (complexity
  bounds, probabilities, linear algebra). Example: ` ```math ` then `T(n) = O(n \log n)`.
- `<Callout type="note|tip|risk|decision|warn">` — highlight a risk, decision, tip, or note; wraps
  markdown. (`note` is blue, `tip` is green, `decision` is purple, `risk` is red, `warn` is yellow.)
- `<FileTree>` — file-change map. One bullet per file, `- <change> <path>`, where `change` is
  `add|modify|delete|move`. A move needs both ends, `- move <from> -> <to>` (the file renders at
  its destination with the origin shown). A path ending in `/` marks a whole directory (e.g.
  `- delete src/legacy/`).

  ```mdx
  <FileTree>
  - add src/gateway/rate-limiter.ts
  - modify src/gateway/middleware.ts
  - delete src/gateway/legacy/
  </FileTree>
  ```
- `<Chart type="bar|line|pie" title="...">` — estimates/metrics. For a single series, one bullet
  per point, `- <label>: <value>` (value is a number). For multiple series (bar/line only), write
  a table whose header is `category | series1 | series2`; the header cells after the first name the
  series (they become the legend), and the first column is the category axis. `pie` is always
  single-series, so use the list form for it (a table is rejected).

  ```mdx
  <Chart type="bar" title="Effort (days)">
  - Limiter: 2
  - Dashboards: 1
  </Chart>

  <Chart type="line" title="Latency by stage (ms)">
  | Stage | p50 | p95 |
  |-------|-----|-----|
  | Auth  | 12  | 30  |
  | DB    | 40  | 120 |
  </Chart>
  ```
- `<Compare>` — weigh approaches side by side as pros/cons cards. Each option is a `## Name`
  heading (append `(pick)` to mark the recommended one) followed by as many `- pro:` / `- con:`
  bullets as you need.

  ```mdx
  <Compare>
  ## Redis sliding window (pick)
  - pro: accurate
  - pro: shared across nodes
  - con: network hop

  ## In-memory token bucket
  - pro: fast
  - con: per-node only
  </Compare>
  ```
- `<Matrix>` — a comparison grid (options across the columns, criteria down the rows) for scoring
  several choices against several dimensions. Write a markdown table; the first column is the row
  labels, and you append `(pick)` to one column header to highlight it. Use `<Compare>` for
  pros/cons, `<Matrix>` for a scorecard.

  ```mdx
  <Matrix>
  | Dimension | Postgres (pick) | ClickHouse | DynamoDB |
  |-----------|-----------------|------------|----------|
  | Writes    | medium          | high       | high     |
  | Querying  | high            | medium     | low      |
  </Matrix>
  ```
- `<Questions>` — open questions you want the reader to resolve before building, one per bullet.
  Use this instead of burying uncertainties in prose. The title defaults to "Open questions";
  override with `title="..."`.

  ```mdx
  <Questions>
  - Should the limiter fail open or fail closed if Redis is unreachable?
  - Is a 15-minute access-token TTL acceptable?
  </Questions>
  ```
- `<Checklist title="Done when">` — acceptance criteria / definition of done, as a markdown task
  list: `- [x]` for done, `- [ ]` for todo.

  ```mdx
  <Checklist title="Done when">
  - [x] Returns 429 over the limit
  - [ ] Dashboards live
  </Checklist>
  ```
- Fenced code blocks are syntax-highlighted (Expressive Code): write ` ```ts ` (or js, json, bash,
  python, go, rust, sql, yaml, etc.) to show a key snippet. Add a file name with
  ` ```ts title="src/path/file.ts" ` to render a filename header on the block.
- Mark lines and text inside a code block with Expressive Code props in the fence meta string
  (no component needed). Three marker types: `mark` (neutral, the default), `ins` (green,
  inserted), `del` (red, removed). Each takes line numbers, ranges, quoted strings, or a
  `/regex/`. Use this to call attention to the lines a plan changes.
  - Lines/ranges (neutral): ` ```ts {2} `, ` ```ts {2-4} `, ` ```ts {1, 3, 5-6} `
  - Typed lines: ` ```ts ins={3-4} del={2} mark={6} ` (combine freely in one block)
  - Inline text: ` ```ts "TokenBucket" `, a rename as ` ```ts del="oldName" ins="newName" `
  - Regex (and capture group): ` ```ts /\bTODO\b/ `, ` ```ts ins=/const (\w+) =/ ` (marks the group)

## Guidance

- Lead with structure: open with an optional one-paragraph context, then a mermaid architecture
  diagram, then `<Phase>` sections. Put risks and key decisions in `<Callout>`s, not buried in prose.
- Right-size the structure to the change. A large effort opens with a diagram and several phases;
  a two-or-three-file change may need only a short `<FileTree>` and a `<Checklist>`. Do not add a
  diagram or phases that carry no information, an empty 2-node flowchart is worse than no diagram.
- Prefer a diagram or a `<FileTree>` over describing structure in sentences.
- Keep prose tight inside phases; the visual is the point.
- In prose, `<`, `{`, and `}` are MDX syntax, so a bare `<Thing>` or `{value}` can break the
  render. Wrap literal angle brackets, braces, generics (`List<T>`), or tag-like text in backticks
  or a code fence, where every character is safe and literal.
- Keep `<Chart>` labels short (a word or two). Long bar/line x-axis labels get dropped or
  crowded; put the detail in the title or the surrounding prose, not the label.
- Do not put series of wildly different magnitudes on one `<Chart>` (e.g. a value near 50 beside
  one near 2,000,000). They share a single y-axis, so the small series flattens to the zero line
  and reads as nothing. Split them into separate charts or normalize to the same unit.
- For mermaid, prefer top-down (`flowchart TD`) once a diagram has many nodes. A very wide
  left-to-right (`LR`) chain shrinks to fit the page and becomes hard to read; split large
  flows into a few smaller diagrams instead of one sprawling one.
- Always `check` before presenting, so the user never sees a broken render.
