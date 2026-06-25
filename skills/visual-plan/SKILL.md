---
name: visual-plan
description: Always use when planning anything non-trivial (an implementation, design, refactor, or migration), as the default and better way to show your plan visually instead of as a wall of text, especially in plan mode. Authors the plan as an MDX file and renders it to a self-contained HTML page with the `vplan` CLI, using a fixed component vocabulary. Also use when the user says "make a visual plan", "render this plan", "show me the plan", or asks for a plan with diagrams/charts, and when they want to review, approve, or sign off on a plan or give structured feedback on it ("let me review the plan", "I want to give feedback", "get my approval") via `vplan render --review`. Skip only for trivial one-step changes or prose-only notes.
---

# Visual Plan

Render a plan as a visual MDX page instead of a wall of text, using the `vplan` CLI. The component
vocabulary is general: although the examples below are code-flavored, it fits any structured plan
(a product launch, a research agenda, an incident response), not just software changes. Use the
components that fit the plan and skip the ones that do not.

Above all, **show, don't tell**: a reader should grasp the plan by scanning its diagrams, phases,
and tables, with prose only connecting the visuals, not carrying the plan itself. The
**Show, don't tell** section below is the heart of this skill.

> **If the `vplan` command is not found**, install it globally first: `npm i -g vplan@latest`
> (published on npm). Re-run the failed command afterward.

## Workflow

1. Write the plan to a `.mdx` file, starting with a single `# Title` heading (it becomes the plan
   title; no frontmatter). Then use the components below; you never write `import` statements, they
   are always in scope.
2. Validate before showing the user: `vplan check <file>.mdx`. Fix every reported `file:line:col`
   issue (it names valid enum values and flags unknown components). `check` also runs a **quality
   lint** that flags weak renders (the enforced Gotchas below); its warnings fail `check`, so fix
   them too.
3. **Present the plan with `vplan render --review <file>.mdx`. This is the default way to deliver a
   plan, not a special mode reserved for sign-off.** It opens the plan with a feedback layer where the
   user comments on whole sections or on selected text, **answers any `<Questions>` directly** (each
   question becomes an inline answer field, printed back as `Answer to "<question>":`), then clicks
   Approve / Deny / Iterate. It **blocks** until they submit, prints the decision, comments, and
   answers to stdout, and exits: approve 0, deny 1, iterate 2, timeout 3 (`--timeout`, default 15m;
   closing the tab counts as deny). It is a long-running foreground server, so run it in the
   background. Then act on the printed feedback:
   - **Approve** -> proceed with the plan as written.
   - **Iterate** -> revise the plan addressing each comment, then review again with `-i N`
     (`--iteration N`) incremented so the bar shows the round; repeat until Approve or Deny. **Edit
     the same `.mdx` file in place** and re-render: `vplan` snapshots each plan it presents (keyed by
     the file path), so the next render automatically marks what changed since the last view with a
     subtle git-gutter accent and a "N changed" summary, letting the user re-review only the delta.
     Pass `--diff <baseline.mdx>` to diff against an explicit file instead of the snapshot, or
     `--no-diff` to suppress diffing (e.g. a clean first look).
   - **Deny** -> stop and reconsider; do not proceed.

   **Default to `--review` for every non-trivial plan.** Targeted comments and in-place `<Questions>`
   answers drive sharper revisions than back-and-forth chat, and the loop ends in an explicit Approve
   so you know it is settled. Use the plain render (step 4) only when the user just wants to look.
4. **Plain render is the fallback, for when the user only wants to look, not shape or decide.**
   `vplan <file>.mdx` writes `<file>.plan.html` next to the source and opens it (`--out <path>` sets
   the location). While iterating visually, `vplan --watch <file>.mdx` starts a live-reloading dev
   server (a long-running foreground server: run it in the background; it writes no file and stops on
   Ctrl+C). The iteration diff shows on a plain render too, not just `--review`.
5. **To export a plan as a static file**, run `vplan export <pdf|jpg> <file>.mdx`. It builds the
   same self-contained page and captures it headless: `pdf` prints a paginated A4 document, `jpg` a
   full-page hi-dpi screenshot. Output defaults to `<file>.pdf` / `<file>.jpg` (override with
   `--out`); `--theme` overrides the baked color scheme, `--no-open` suppresses opening the result.
   This needs a Chromium: it uses a system Chrome/Edge or a `playwright`-installed one, and otherwise
   prints `npx playwright install chromium`. Use this when the user wants a shareable file rather than
   the interactive HTML page.

Run `vplan components` anytime for the exact prop signatures.

## Components

The data components (`FileTree`, `Chart`, `Stat`, `Compare`, `Matrix`, `Questions`, `Checklist`)
take their data as **markdown children**, not props: write a normal markdown list (or, for `Matrix`
and a multi-series `Chart`, a markdown table) between the tags. Only the scalar settings
(`title`, `type`, `status`) are attributes. This is fewer tokens and avoids the `{[{ ... }]}`
brace errors that break a render.

- `<Phase title="..." status="planned|active|done">` — one step in a numbered vertical
  timeline; wraps markdown (ordered lists, prose, nested components). The steps auto-number in
  order. One per major step of the plan.
- ` ```mermaid ` fenced block — diagrams: architecture (`flowchart`), `sequenceDiagram`,
  dependency graphs, `stateDiagram-v2`, `classDiagram`, `erDiagram`, and `xychart-beta`. Reach for
  this first for anything structural. (gantt and pie are not supported; use `<Chart>` for
  quantitative data. `check` now validates each diagram, so an unsupported type fails check with a
  `file:line:col` instead of rendering an error box.)
- ` ```math ` fenced block — a display formula written in LaTeX, typeset as math (complexity
  bounds, probabilities, linear algebra). Example: ` ```math ` then `T(n) = O(n \log n)`.
- `<Callout type="note|tip|risk|decision|warn">` — highlight a risk, decision, tip, or note; wraps
  markdown. (`note` is blue, `tip` is green, `decision` is purple, `risk` is red, `warn` is yellow.)
- `<FileTree>` — file-change map. One bullet per file, `- <change> <path>`, where `change` is
  `add|modify|delete|move`. A move needs both ends, `- move <from> -> <to>` (the file renders at
  its destination with the origin shown). A path ending in `/` marks a whole directory (e.g.
  `- delete src/legacy/`). A colored file-type icon is added automatically from the path's
  extension. Append ` -- <note>` to any line for a short inline comment on that change (what it does
  or why); keep it to a phrase, since it shares the row with the file name.

  ```mdx
  <FileTree>
  - add src/gateway/rate-limiter.ts -- sliding-window check against Redis
  - modify src/gateway/middleware.ts -- mount the limiter behind the flag
  - delete src/gateway/legacy/
  </FileTree>
  ```
- `<Chart type="bar|line|area|scatter|radar|gauge|funnel|treemap|pie" title="...">` —
  estimates/metrics. Single series: one bullet per point, `- <label>: <value>` (a number).
  Multi-series (`bar`/`line`/`area`/`radar`): a table whose header is `category | series1 | series2`
  (cells after the first name the series and become the legend; the first column is the category
  axis). Specifics: `scatter` is a table with exactly **two** value columns read as x and y
  (`| point | x | y |`); `pie`/`gauge`/`funnel`/`treemap` are always single-series, list form only (a
  table is rejected), with `gauge` on a 0-100 scale and `funnel` descending. Add `stacked` to a
  multi-series `bar`/`area` (`<Chart type="bar" stacked>`) to stack rather than group.

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
  override with `title="..."`. In a `--review` session each question is directly answerable, so
  prefer a `<Questions>` block over prose when you want the reviewer to answer specific questions.

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
- `<Stat>` — headline plan metrics as a grid of cards (files changed, estimated uptime, rollout).
  One card per bullet, `- <label>: <value> (<intent>) -- <caption>`, where intent is one of
  `note|good|warn|risk` and both `(intent)` and `-- caption` are optional. The value is free text
  (`5 min`, `99.9%`), not a number. Use this for static facts, not time series (use `<Chart>` for
  those). Only add a `<Stat>` when the plan genuinely has standout numbers worth surfacing; most
  plans have none, and an invented or filler metric is worse than omitting the component entirely.

  ```mdx
  <Stat>
  - Files changed: 12
  - Est. uptime: 99.9% (good)
  - RPO: 5 min (risk) -- worst-case data loss
  </Stat>
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

## Show, don't tell

The whole point of a visual plan is to replace a wall of prose with something the reader grasps by
scanning. Default to a component over a sentence: if a fact has structure, show it; do not describe
it in paragraphs. Prose is the connective tissue between visuals, never the substance.

- **Lead with the structure.** Open with at most a one-paragraph context, then a ` ```mermaid `
  architecture diagram, then the `<Phase>` timeline. The reader should understand the shape of the
  plan before reading a single full sentence.
- **Prefer a diagram or a `<FileTree>` to describing structure in words.** A flowchart of the data
  path beats a paragraph tracing it; a file-change map beats sentences listing the files.
- **Move the meaning out of prose into the component that carries it.** Risks and decisions go in
  `<Callout>`s, open questions in `<Questions>`, tradeoffs in `<Compare>` / `<Matrix>`, acceptance
  criteria in `<Checklist>`, not buried in paragraphs where they are easy to skim past.
- **Keep prose tight inside phases.** A `<Phase>` is a step, not an essay: a line or two of intent,
  then the visual. The visual is the point.
- **Right-size what you show.** A large effort opens with a diagram and several phases; a
  two-or-three-file change may need only a short `<FileTree>` and a `<Checklist>`. Do not add a
  diagram or phase that carries no information: an empty 2-node flowchart shows nothing and is worse
  than one plain sentence. Show when there is structure to show; otherwise a tight sentence is fine
  (this applies to `<Stat>` too, as its own entry notes).

## Composing a plan

- `<Phase>` and `<Callout>` wrap arbitrary markdown and components: a `<FileTree>`, `<Chart>`,
  `<Matrix>`, a ` ```mermaid ` diagram, a code block, or a `- [ ]` task list all nest inside them.
  Nest freely to group related content under a step or a highlight.
- Diagrams and charts each render a hover "expand" button that opens a zoomable, pannable
  fullscreen viewer, so a dense diagram stays legible even when shrunk inline (code blocks do not).
  You can lean on it for a necessarily-large diagram, but splitting into smaller diagrams still
  reads better when the inline view must stand on its own.

## Rules

- **Never pass `--no-open` for a user-facing plan.** The point is that the user sees it; the plain
  render and `--watch` open automatically. Reserve `--no-open` for an explicit headless/CI request.
- **No images or external assets.** The page is a single self-contained file, so a markdown image
  (`![](url)`) or any external asset cannot be embedded, and `check` rejects markdown images. Use a
  ` ```mermaid ` diagram for anything visual, or describe it in text.

## Gotchas

Several of these (a wall-of-prose phase, a wide LR mermaid diagram, an over-long `Matrix` cell, a
commented `FileTree` move row, a wildly-scaled `Chart`) are now enforced by the `check` quality lint
and will fail it, so they are hard rules, not just style advice.

- **`<`, `{`, and `}` are MDX syntax in prose.** A bare `<Thing>` or `{value}` can break the render.
  Wrap literal angle brackets, braces, generics (`List<T>`), or tag-like text in backticks or a code
  fence, where every character is safe and literal.
- **Raw inline HTML tags fail `check`.** `<kbd>`, `<sub>`, `<sup>`, `<details>` and the like are read
  as unknown components and fail; use backticks or plain text instead. Plain markdown otherwise works
  alongside the components: GFM tables (outside `<Matrix>` / `<Chart>`), blockquotes, footnotes,
  `~~strikethrough~~`, autolinks, `- [ ]` task lists, and custom-start ordered lists all render.
- **`<Chart>` shows the shape of the data, not exact figures.** There are no on-bar value labels, so
  any number the reader must know precisely belongs in prose too. Keep labels to a word or two (long
  bar/line x-axis labels get dropped or crowded), and never put series of wildly different magnitudes
  on one chart: a value near 50 beside one near 2,000,000 shares a single y-axis and flattens the
  small series to the zero line. Split into separate charts or normalize to the same unit.
- **`<Matrix>` cells do not wrap.** A long sentence in one cell forces a horizontal scrollbar and
  pushes the other columns off-screen. Keep cells to a word or a short score; put rationale in prose
  or a `<Callout>`, not in a cell.
- **Avoid `-- comments` on `<FileTree>` `move` rows.** A move already shows its origin path (the
  `← <from>` annotation), which eats most of the row width, so a comment on the same row gets crowded
  out. Leave move rows uncommented and put any explanation in prose or a `<Callout>`; reserve `--
  comments` for add/modify/delete rows, which have the space.
- **Wide mermaid diagrams shrink to illegibility.** Prefer top-down (`flowchart TD`) once a diagram
  has many nodes; a long left-to-right (`LR`) chain shrinks to fit the page and becomes effectively
  unreadable inline. Split a large flow into a few smaller diagrams instead of one sprawling one.
