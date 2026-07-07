import { z } from 'zod'

/**
 * Single source of truth for the Visual Plan component vocabulary.
 *
 * This module is imported by BOTH the browser runtime (for render-time zod
 * validation) and the Node CLI (for static `check` and the `components`
 * catalog printer), so it must stay free of any React, recharts, or mermaid
 * imports. Keep it isomorphic.
 */

/** The visualplan.dev page that decodes a `?data=` share link and recompiles the plan in-browser.
 * Lives in the index (not the `share` codec subpath) so the vendored, fflate-free runtime can import
 * it for the share button; the CLI's `buildShareUrl` reads it from here too. One source of truth. */
export const SHARE_VIEW_URL = 'https://visualplan.dev/view'

/** The reviewer's verdict in interactive review mode (`vplan render --review`). */
export const REVIEW_DECISION_VALUES = ['approve', 'deny', 'iterate'] as const

/** How strongly a review comment binds: a `must-fix` blocks approval, a `suggestion` does not. */
export const REVIEW_SEVERITY_VALUES = ['must-fix', 'suggestion'] as const

/** A single targeted comment from a review session: which section it is about, and the note. */
export const reviewCommentSchema = z.object({
  section: z.string().min(1),
  body: z.string().min(1),
  // Optional weight the reviewer assigns; absent means untagged (an old client or an unweighted
  // note), which readers should treat like a suggestion.
  severity: z.enum(REVIEW_SEVERITY_VALUES).optional(),
})

/** A direct answer to one of a plan's `Questions`, keyed by the question text the reviewer answered. */
export const reviewAnswerSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
})

/**
 * The feedback payload the review page POSTs to the CLI's `/__vp_feedback` endpoint. Isomorphic so
 * the page (which constructs it) and the CLI (which validates it) share one contract and cannot
 * drift; `comments` and `answers` default to empty because Approve and Deny may carry neither.
 * `answers` are distinct from `comments`: they are direct responses to the plan's `Questions`.
 */
export const feedbackSchema = z.object({
  decision: z.enum(REVIEW_DECISION_VALUES),
  comments: z.array(reviewCommentSchema).default([]),
  answers: z.array(reviewAnswerSchema).default([]),
  note: z.string().optional(),
  // The queued plan this feedback resolves, set only in Review Queue mode so the daemon can route
  // the verdict to the caller waiting on this id. Absent for a standalone single `--review`, where
  // there is exactly one plan and nothing to disambiguate. `formatFeedback` ignores it.
  planId: z.string().min(1).optional(),
})

export type ReviewDecision = (typeof REVIEW_DECISION_VALUES)[number]
export type ReviewSeverity = (typeof REVIEW_SEVERITY_VALUES)[number]
export type ReviewComment = z.infer<typeof reviewCommentSchema>
export type ReviewAnswer = z.infer<typeof reviewAnswerSchema>
export type Feedback = z.infer<typeof feedbackSchema>

/** The sidebar status of a queued plan in Review Queue mode: waiting, currently shown, decided, or
 * `iterating` (the reviewer requested iteration and the daemon holds the entry awaiting the revised
 * plan re-enqueued under the same key). */
export const QUEUE_STATUS_VALUES = ['pending', 'active', 'done', 'iterating'] as const

/**
 * One plan in the Review Queue, as the daemon streams it to the sidebar shell. `dir` is the
 * basename of the directory the plan originated from, shown beside the title so plans from
 * different projects stay distinguishable in the single machine-wide queue. Isomorphic so the
 * daemon (which emits entries) and the shell (which renders them) share one contract.
 */
export const queueEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  dir: z.string(),
  status: z.enum(QUEUE_STATUS_VALUES).default('pending'),
  // The revision number when this plan is a re-review (`--iteration N`); the sidebar shows it as a
  // `vN` chip for N >= 2. Absent on a first review.
  iteration: z.number().int().positive().optional(),
  // The locked-in verdict once the plan is `done`, so the sidebar shows the matching icon (check /
  // cross / iterate) rather than a generic one. Absent while pending.
  decision: z.enum(REVIEW_DECISION_VALUES).optional(),
  // The daemon's serving-generation counter, bumped on every in-place same-key re-enqueue. Distinct
  // from `iteration` (the author-facing round): `rev` drives the shell's iframe re-keying and
  // unseen-update dots, and moves even when the author does not bump the iteration.
  rev: z.number().int().positive().default(1),
  // Epoch-ms stamps set by the daemon (enqueue / last status or revision change), shown as relative
  // times in the sidebar. Optional so frames from an older daemon still parse.
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
})

export type QueueStatus = (typeof QUEUE_STATUS_VALUES)[number]
export type QueueEntry = z.infer<typeof queueEntrySchema>

export const STATUS_VALUES = ['planned', 'active', 'done'] as const
export const CHANGE_VALUES = ['add', 'modify', 'delete', 'move'] as const
export const CHART_TYPE_VALUES = [
  'bar',
  'line',
  'area',
  'scatter',
  'radar',
  'gauge',
  'funnel',
  'treemap',
  'pie',
] as const
export const CALLOUT_TYPE_VALUES = ['note', 'tip', 'risk', 'decision', 'warn'] as const
export const STAT_INTENT_VALUES = ['note', 'good', 'warn', 'risk'] as const

export const phaseSchema = z.object({
  title: z.string().min(1, 'title is required'),
  status: z.enum(STATUS_VALUES).default('planned'),
})

export const fileTreeSchema = z.object({
  files: z
    .array(
      z.object({
        path: z.string().min(1, 'each file needs a path'),
        change: z.enum(CHANGE_VALUES),
        // For a move, the origin path; the entry is placed at `path` (its destination).
        from: z.string().optional(),
        // An optional inline note, authored after a " -- " trailer, shown muted on the row.
        comment: z.string().optional(),
        // The file-type icon SVG, injected at build time by the CLI's remark-filetree-icons pass
        // (Material Icon Theme), never authored. Absent on the /view path, where the component
        // falls back to a generic icon.
        icon: z.string().optional(),
      }),
    )
    .min(1, 'files must list at least one entry'),
})

export const chartSchema = z.object({
  type: z.enum(CHART_TYPE_VALUES),
  title: z.string().optional(),
  // Stacks multi-series bar/area on one axis (recharts stackId); ignored by other types.
  stacked: z.boolean().optional(),
  // One or more series. A single-series chart (the `- label: value` list form) has one
  // synthetic series; a multi-series chart (the table form) names a series per column.
  series: z.array(z.string().min(1)).min(1, 'chart needs at least one series'),
  data: z
    .array(z.object({ label: z.string(), values: z.array(z.number()) }))
    .min(1, 'data must have at least one point'),
})

export const matrixSchema = z.object({
  // The top-left header cell: the name of the row axis (e.g. "Dimension"). May be blank.
  corner: z.string().default(''),
  columns: z
    .array(
      z.object({
        name: z.string().min(1, 'each column needs a name'),
        pick: z.boolean().optional(),
      }),
    )
    .min(2, 'matrix needs at least two columns'),
  rows: z
    .array(
      z.object({ label: z.string().min(1, 'each row needs a label'), cells: z.array(z.string()) }),
    )
    .min(1, 'matrix needs at least one row'),
})

export const compareSchema = z.object({
  options: z
    .array(
      z.object({
        name: z.string().min(1, 'each option needs a name'),
        pros: z.array(z.string()).default([]),
        cons: z.array(z.string()).default([]),
        pick: z.boolean().optional(),
      }),
    )
    .min(2, 'compare needs at least two options'),
})

export const calloutSchema = z.object({
  type: z.enum(CALLOUT_TYPE_VALUES).default('note'),
})

/** One open question, optionally offering multiple-choice options the reviewer can pick from
 * (authored as nested bullets under the question). No options means free-text-only. */
export const questionItemSchema = z.object({
  text: z.string().min(1, 'each question needs text'),
  options: z.array(z.string().min(1, 'each option needs text')).default([]),
})

export type QuestionItem = z.infer<typeof questionItemSchema>

export const questionsSchema = z.object({
  title: z.string().default('Open questions'),
  items: z
    .array(
      // A plain string is normalized to a free-text question, so consumers always see one shape.
      // The string form stays accepted because option-less questions parse to plain strings (the
      // pre-options wire shape, keeping flat plans byte-stable) and direct-JSX callers pass them.
      z
        .union([z.string().min(1), questionItemSchema])
        .transform(item => (typeof item === 'string' ? { text: item, options: [] } : item)),
    )
    .min(1, 'questions needs at least one item'),
})

export const checklistSchema = z.object({
  title: z.string().optional(),
  items: z
    .array(
      z.object({
        text: z.string().min(1, 'each item needs text'),
        done: z.boolean().default(false),
      }),
    )
    .min(1, 'checklist needs at least one item'),
})

export const statSchema = z.object({
  title: z.string().optional(),
  items: z
    .array(
      z.object({
        label: z.string().min(1, 'each stat needs a label'),
        value: z.string().min(1, 'each stat needs a value'),
        intent: z.enum(STAT_INTENT_VALUES).optional(),
        caption: z.string().optional(),
      }),
    )
    .min(1, 'stat needs at least one item'),
})

/** Describes a component for the `components` printer and the static checker. */
export interface CatalogEntry {
  name: string
  summary: string
  /** Props the CLI can statically validate from MDX source (string-literal enums). */
  staticEnums: Record<string, readonly string[]>
  example: string
}

// Each entry is its own named export so a consumer of the programmatic API can import a single
// component's descriptor (`import { chart } from 'vplan'`). The const name is the export
// identifier; the `name` field stays the human label used by `check` and the components printer
// (so `mermaid`/`math` keep their "(code fence)" labels). CATALOG is composed from them below.
export const phase: CatalogEntry = {
  name: 'Phase',
  summary: 'A numbered vertical-timeline step with a status badge. Wraps markdown.',
  staticEnums: { status: STATUS_VALUES },
  example: '<Phase title="Build the API" status="active">\n  1. Define routes\n</Phase>',
}

export const fileTree: CatalogEntry = {
  name: 'FileTree',
  summary:
    'A nested directory tree of file changes. Write a markdown list, one "- <change> <path>" per file; change is add/modify/delete/move. Append " -- <note>" for an inline comment.',
  staticEnums: {},
  example:
    '<FileTree>\n- add src/api/routes.ts -- new sliding-window limiter\n- modify src/api/db.ts\n- delete src/legacy.ts\n</FileTree>',
}

export const chart: CatalogEntry = {
  name: 'Chart',
  summary:
    'A bar/line/area/scatter/radar/gauge/funnel/treemap/pie chart for estimates or metrics. Single series (bar/line/area/gauge/funnel/treemap/pie): a markdown list of "- <label>: <value>". Multiple series (bar/line/area/radar): a markdown table with a "category | series1 | series2" header. Scatter needs a table with exactly two value columns (x, y). Add the "stacked" attribute to a multi-series bar/area to stack the series.',
  staticEnums: { type: CHART_TYPE_VALUES },
  example:
    '<Chart type="bar" title="Effort (days)">\n- API: 3\n- UI: 2\n</Chart>\n\n<Chart type="line" title="Latency by stage (ms)">\n| Stage | p50 | p95 |\n|-------|-----|-----|\n| Auth  | 12  | 30  |\n| DB    | 40  | 120 |\n</Chart>\n\n<Chart type="bar" stacked title="Effort by area (days)">\n| Phase | API | UI |\n|-------|-----|----|\n| Build | 3   | 2  |\n| Test  | 1   | 1  |\n</Chart>',
}

export const compare: CatalogEntry = {
  name: 'Compare',
  summary:
    'Side-by-side option cards for weighing approaches. Each option is a "## Name" heading (add "(pick)" to recommend one) with as many "- pro:" / "- con:" bullets as you need.',
  staticEnums: {},
  example:
    '<Compare>\n## Postgres (pick)\n- pro: ACID\n- pro: mature tooling\n- con: vertical scaling\n\n## SQLite\n- pro: simple\n- con: single-writer\n</Compare>',
}

export const matrix: CatalogEntry = {
  name: 'Matrix',
  summary:
    'A comparison grid (options x dimensions) for weighing several choices across several criteria. Write a markdown table; the first column is the row labels, append "(pick)" to one column header to highlight it. Use Compare for pros/cons, Matrix for a scorecard.',
  staticEnums: {},
  example:
    '<Matrix>\n| Dimension | Postgres (pick) | ClickHouse | DynamoDB |\n|-----------|-----------------|------------|----------|\n| Writes    | medium          | high       | high     |\n| Querying  | high            | medium     | low      |\n| Ops cost  | low             | medium     | low      |\n</Matrix>',
}

export const callout: CatalogEntry = {
  name: 'Callout',
  summary: 'A highlighted note/tip/risk/decision/warning block. Wraps markdown.',
  staticEnums: { type: CALLOUT_TYPE_VALUES },
  example: '<Callout type="tip">\n  Use ins=/regex/ to mark code as inserted.\n</Callout>',
}

export const questions: CatalogEntry = {
  name: 'Questions',
  summary:
    'Open questions you want the reader to weigh in on before building, as a highlighted panel. Write a markdown list, one question per bullet. Nested bullets under a question become clickable multiple-choice options in a review (the reviewer picks one or types an "Other" answer); a question with no nested bullets takes a free-text answer. Title defaults to "Open questions"; override with title.',
  staticEnums: {},
  example:
    '<Questions>\n- Should refresh tokens rotate on every use?\n  - Yes, rotate every use\n  - Only on refresh after 24h\n- Is a 15-minute access-token TTL acceptable?\n</Questions>',
}

export const checklist: CatalogEntry = {
  name: 'Checklist',
  summary:
    'Acceptance criteria / definition of done. Write a markdown task list ("- [x]" done, "- [ ]" todo).',
  staticEnums: {},
  example:
    '<Checklist title="Done when">\n- [x] Returns 429 over the limit\n- [ ] Dashboards live\n</Checklist>',
}

export const stat: CatalogEntry = {
  name: 'Stat',
  summary:
    'Headline plan metrics as a grid of cards. Write a markdown list, one "- <label>: <value> (<intent>) -- <caption>" per stat; value is free text, intent (good/warn/risk/note) and the "-- caption" are optional.',
  staticEnums: {},
  example:
    '<Stat>\n- Files changed: 12\n- Est. uptime: 99.9% (good)\n- RPO: 5 min (risk) -- worst-case data loss\n</Stat>',
}

export const mermaid: CatalogEntry = {
  name: 'mermaid (code fence)',
  summary:
    'A flowchart, sequence, state, class, ER, or XY-chart diagram. Write a ```mermaid fenced block. (gantt/pie are not supported by the renderer.)',
  staticEnums: {},
  example: '```mermaid\nflowchart LR\n  A[Client] --> B[API] --> C[(DB)]\n```',
}

export const math: CatalogEntry = {
  name: 'math (code fence)',
  summary:
    'A display math formula. Write a ```math fenced block containing LaTeX; it is typeset as MathML.',
  staticEnums: {},
  example: '```math\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n```',
}

export const CATALOG: readonly CatalogEntry[] = [
  phase,
  fileTree,
  chart,
  compare,
  matrix,
  callout,
  questions,
  checklist,
  stat,
  mermaid,
  math,
]
