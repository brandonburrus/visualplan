/**
 * The programmatic interface for `vplan`: render and validate a plan from an in-memory MDX string,
 * and introspect the component vocabulary. This is the package's import entry (`import { renderPlan }
 * from 'vplan'`); the CLI bin is a separate entry. Nothing here touches the filesystem unless you
 * pass `renderPlan`'s `out` option.
 */
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { buildHtml } from './build/compile.js'
import { type CheckIssue, checkSource } from './build/check.js'

export interface RenderOptions {
  /** Also write the rendered HTML to this path. The HTML string is returned regardless. */
  out?: string
}

/** Thrown by `renderPlan` when the plan fails validation, carrying the structured issues. */
export class InvalidPlanError extends Error {
  readonly issues: CheckIssue[]
  constructor(issues: CheckIssue[]) {
    const detail = issues
      .map(issue => `  ${issue.line}:${issue.column}  ${issue.message}`)
      .join('\n')
    super(`Plan has ${issues.length} issue(s):\n${detail}`)
    this.name = 'InvalidPlanError'
    this.issues = issues
  }
}

/**
 * Compile a plan's MDX source to a self-contained HTML page, returned as a string. Validates the
 * plan first and throws `InvalidPlanError` if it has any issues, so a programmatic caller gets the
 * same self-correction guarantee the CLI has. Pass `out` to also write the HTML to a file.
 */
export async function renderPlan(source: string, options: RenderOptions = {}): Promise<string> {
  const issues = await checkSource(source)
  if (issues.length > 0) throw new InvalidPlanError(issues)
  const html = await buildHtml(source)
  if (options.out) await writeFile(resolve(options.out), html)
  return html
}

/** Validate a plan's MDX source, returning the issues (an empty array when the plan is valid). */
export async function checkPlan(source: string): Promise<CheckIssue[]> {
  return checkSource(source)
}

export type { CheckIssue } from './build/check.js'
export type { CatalogEntry } from '@visualplan/core'
// The component vocabulary, one named descriptor per component, so a consumer can introspect a
// single component's props and enums (`import { chart } from 'vplan'`).
export {
  callout,
  chart,
  checklist,
  compare,
  fileTree,
  math,
  matrix,
  mermaid,
  phase,
  questions,
  stat,
} from '@visualplan/core'
