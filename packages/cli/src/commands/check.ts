import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { type CheckIssue, checkPlan } from '../build/check.js'
import { lintPlan } from '../build/lint.js'

/** Resolve a plan-file argument to an absolute path, failing with a friendly message when it is
 * missing or not a regular file. Without this the reader throws a raw `ENOENT`/`EISDIR`, and the
 * default `render` command turns a mistyped subcommand into a confusing "no such file" error. */
export function resolvePlanFile(file: string): string {
  const absolute = resolve(file)
  if (!existsSync(absolute)) throw new Error(`File not found: ${file}`)
  if (!statSync(absolute).isFile()) throw new Error(`Not a file: ${file}`)
  return absolute
}

/** Print check issues in an editor-clickable `file:line:column  severity: message` format. */
export function printIssues(file: string, issues: CheckIssue[]): void {
  for (const issue of issues) {
    const label = (issue.severity ?? 'error') === 'warn' ? 'warning' : 'error'
    process.stderr.write(`${file}:${issue.line}:${issue.column}  ${label}: ${issue.message}\n`)
  }
}

/** `count noun(s)`, pluralizing the noun. */
function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

/**
 * `vplan check <file>` — validate a plan's MDX without rendering it. Runs the syntax check first;
 * only if the plan parses cleanly does it run the quality lint, so lint warnings never bury a real
 * syntax error and the lint parse never sees malformed MDX. A lint warning fails the check too, so
 * a weak plan blocks until fixed.
 */
export async function runCheck(file: string): Promise<void> {
  const path = resolvePlanFile(file)
  const errors = await checkPlan(path)
  const issues = errors.length === 0 ? await lintPlan(path) : errors
  if (issues.length === 0) {
    process.stdout.write(`${file} is valid\n`)
    return
  }
  printIssues(file, issues)
  const warnings = issues.filter(issue => issue.severity === 'warn').length
  const summary = errors.length > 0 ? count(issues.length, 'error') : count(warnings, 'warning')
  process.stdout.write(`\n${summary} found\n`)
  process.exitCode = 1
}
