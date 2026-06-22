import { z } from 'zod'

/**
 * Single source of truth for the Visual Plan component vocabulary.
 *
 * This module is imported by BOTH the browser runtime (for render-time zod
 * validation) and the Node CLI (for static `check` and the `components`
 * catalog printer), so it must stay free of any React, recharts, or mermaid
 * imports. Keep it isomorphic.
 */

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

export const questionsSchema = z.object({
  title: z.string().default('Open questions'),
  items: z.array(z.string().min(1)).min(1, 'questions needs at least one item'),
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

/** Describes a component for the `components` printer and the static checker. */
export interface CatalogEntry {
  name: string
  summary: string
  /** Props the CLI can statically validate from MDX source (string-literal enums). */
  staticEnums: Record<string, readonly string[]>
  example: string
}

export const CATALOG: readonly CatalogEntry[] = [
  {
    name: 'Phase',
    summary: 'A numbered vertical-timeline step with a status badge. Wraps markdown.',
    staticEnums: { status: STATUS_VALUES },
    example: '<Phase title="Build the API" status="active">\n  1. Define routes\n</Phase>',
  },
  {
    name: 'FileTree',
    summary:
      'A nested directory tree of file changes. Write a markdown list, one "- <change> <path>" per file; change is add/modify/delete/move.',
    staticEnums: {},
    example:
      '<FileTree>\n- add src/api/routes.ts\n- modify src/api/db.ts\n- delete src/legacy.ts\n</FileTree>',
  },
  {
    name: 'Chart',
    summary:
      'A bar/line/area/scatter/radar/gauge/funnel/treemap/pie chart for estimates or metrics. Single series (bar/line/area/gauge/funnel/treemap/pie): a markdown list of "- <label>: <value>". Multiple series (bar/line/area/radar): a markdown table with a "category | series1 | series2" header. Scatter needs a table with exactly two value columns (x, y). Add the "stacked" attribute to a multi-series bar/area to stack the series.',
    staticEnums: { type: CHART_TYPE_VALUES },
    example:
      '<Chart type="bar" title="Effort (days)">\n- API: 3\n- UI: 2\n</Chart>\n\n<Chart type="line" title="Latency by stage (ms)">\n| Stage | p50 | p95 |\n|-------|-----|-----|\n| Auth  | 12  | 30  |\n| DB    | 40  | 120 |\n</Chart>\n\n<Chart type="bar" stacked title="Effort by area (days)">\n| Phase | API | UI |\n|-------|-----|----|\n| Build | 3   | 2  |\n| Test  | 1   | 1  |\n</Chart>',
  },
  {
    name: 'Compare',
    summary:
      'Side-by-side option cards for weighing approaches. Each option is a "## Name" heading (add "(pick)" to recommend one) with as many "- pro:" / "- con:" bullets as you need.',
    staticEnums: {},
    example:
      '<Compare>\n## Postgres (pick)\n- pro: ACID\n- pro: mature tooling\n- con: vertical scaling\n\n## SQLite\n- pro: simple\n- con: single-writer\n</Compare>',
  },
  {
    name: 'Matrix',
    summary:
      'A comparison grid (options x dimensions) for weighing several choices across several criteria. Write a markdown table; the first column is the row labels, append "(pick)" to one column header to highlight it. Use Compare for pros/cons, Matrix for a scorecard.',
    staticEnums: {},
    example:
      '<Matrix>\n| Dimension | Postgres (pick) | ClickHouse | DynamoDB |\n|-----------|-----------------|------------|----------|\n| Writes    | medium          | high       | high     |\n| Querying  | high            | medium     | low      |\n| Ops cost  | low             | medium     | low      |\n</Matrix>',
  },
  {
    name: 'Callout',
    summary: 'A highlighted note/tip/risk/decision/warning block. Wraps markdown.',
    staticEnums: { type: CALLOUT_TYPE_VALUES },
    example: '<Callout type="tip">\n  Use ins=/regex/ to mark code as inserted.\n</Callout>',
  },
  {
    name: 'Questions',
    summary:
      'Open questions you want the reader to weigh in on before building, as a highlighted panel. Write a markdown list. Title defaults to "Open questions"; override with title.',
    staticEnums: {},
    example:
      '<Questions>\n- Should refresh tokens rotate on every use?\n- Is a 15-minute access-token TTL acceptable?\n</Questions>',
  },
  {
    name: 'Checklist',
    summary:
      'Acceptance criteria / definition of done. Write a markdown task list ("- [x]" done, "- [ ]" todo).',
    staticEnums: {},
    example:
      '<Checklist title="Done when">\n- [x] Returns 429 over the limit\n- [ ] Dashboards live\n</Checklist>',
  },
  {
    name: 'mermaid (code fence)',
    summary:
      'A flowchart, sequence, state, class, ER, or XY-chart diagram. Write a ```mermaid fenced block. (gantt/pie are not supported by the renderer.)',
    staticEnums: {},
    example: '```mermaid\nflowchart LR\n  A[Client] --> B[API] --> C[(DB)]\n```',
  },
  {
    name: 'math (code fence)',
    summary:
      'A display math formula. Write a ```math fenced block containing LaTeX; it is typeset as MathML.',
    staticEnums: {},
    example: '```math\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n```',
  },
]
