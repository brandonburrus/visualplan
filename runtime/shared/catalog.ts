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
    summary: 'A file-change map with add/modify/delete/move markers.',
    staticEnums: {},
    example:
      '<FileTree files={[{ path: "src/api.ts", change: "add" }, { path: "src/db.ts", change: "modify" }]} />',
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
    name: 'mermaid (code fence)',
    summary:
      'Any diagram, graph, flow, sequence, gantt, state, or ER diagram. Write a ```mermaid fenced block.',
    staticEnums: {},
    example: '```mermaid\nflowchart LR\n  A[Client] --> B[API] --> C[(DB)]\n```',
  },
]
