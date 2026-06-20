import { z } from 'zod'

/**
 * Single source of truth for the VisualPlan component vocabulary.
 *
 * This module is imported by BOTH the browser runtime (for render-time zod
 * validation) and the Node CLI (for static `check` and the `components`
 * catalog printer), so it must stay free of any React, recharts, or mermaid
 * imports. Keep it isomorphic.
 */

export const STATUS_VALUES = ['planned', 'active', 'done'] as const
export const CHANGE_VALUES = ['add', 'modify', 'delete', 'move'] as const
export const CHART_TYPE_VALUES = ['bar', 'line', 'pie'] as const
export const CALLOUT_TYPE_VALUES = ['note', 'risk', 'decision', 'warn'] as const

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
      }),
    )
    .min(1, 'files must list at least one entry'),
})

export const chartSchema = z.object({
  type: z.enum(CHART_TYPE_VALUES),
  title: z.string().optional(),
  data: z
    .array(z.object({ label: z.string(), value: z.number() }))
    .min(1, 'data must have at least one point'),
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
    summary: 'A collapsible plan stage with a status badge. Wraps markdown.',
    staticEnums: { status: STATUS_VALUES },
    example: '<Phase title="Build the API" status="active">\n  1. Define routes\n</Phase>',
  },
  {
    name: 'FileTree',
    summary:
      'A nested directory tree of file changes, built from the paths, with add/modify/delete/move markers.',
    staticEnums: {},
    example:
      '<FileTree files={[{ path: "src/api/routes.ts", change: "add" }, { path: "src/api/db.ts", change: "modify" }, { path: "src/legacy.ts", change: "delete" }]} />',
  },
  {
    name: 'Chart',
    summary: 'A bar/line/pie chart for estimates or metrics.',
    staticEnums: { type: CHART_TYPE_VALUES },
    example:
      '<Chart type="bar" title="Effort (days)" data={[{ label: "API", value: 3 }, { label: "UI", value: 2 }]} />',
  },
  {
    name: 'Compare',
    summary: 'Side-by-side option cards for weighing approaches.',
    staticEnums: {},
    example:
      '<Compare options={[{ name: "Postgres", pros: ["ACID"], cons: ["ops"], pick: true }, { name: "SQLite", pros: ["simple"], cons: ["scale"] }]} />',
  },
  {
    name: 'Callout',
    summary: 'A highlighted note/risk/decision/warning block. Wraps markdown.',
    staticEnums: { type: CALLOUT_TYPE_VALUES },
    example: '<Callout type="risk">\n  Migration locks the table for ~2s.\n</Callout>',
  },
  {
    name: 'Questions',
    summary:
      'Open questions you want the reader to weigh in on before building, as a highlighted panel. Title defaults to "Open questions"; override with title.',
    staticEnums: {},
    example:
      '<Questions items={["Should refresh tokens rotate on every use?", "Is a 15-minute access-token TTL acceptable?"]} />',
  },
  {
    name: 'Checklist',
    summary: 'Acceptance criteria / definition of done, with done and todo states.',
    staticEnums: {},
    example:
      '<Checklist title="Done when" items={[{ text: "Returns 429 over the limit", done: true }, { text: "Dashboards live" }]} />',
  },
  {
    name: 'mermaid (code fence)',
    summary:
      'A flowchart, sequence, state, class, ER, or XY-chart diagram. Write a ```mermaid fenced block. (gantt/pie are not supported by the renderer.)',
    staticEnums: {},
    example: '```mermaid\nflowchart LR\n  A[Client] --> B[API] --> C[(DB)]\n```',
  },
]
