import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { type CheckIssue, checkPlan } from '../build/check.js'

/** Resolve a plan-file argument to an absolute path, failing with a friendly message when it is
 * missing or not a regular file. Without this the reader throws a raw `ENOENT`/`EISDIR`, and the
 * default `render` command turns a mistyped subcommand into a confusing "no such file" error. */
export function resolvePlanFile(file: string): string {
  const absolute = resolve(file)
  if (!existsSync(absolute)) throw new Error(`File not found: ${file}`)
  if (!statSync(absolute).isFile()) throw new Error(`Not a file: ${file}`)
  return absolute
}

/** Print check issues in an editor-clickable `file:line:column  message` format. */
export function printIssues(file: string, issues: CheckIssue[]): void {
  for (const issue of issues) {
    process.stderr.write(`${file}:${issue.line}:${issue.column}  ${issue.message}\n`)
  }
}

/** `vplan check <file>` — validate a plan's MDX without rendering it. */
export async function runCheck(file: string): Promise<void> {
  const issues = await checkPlan(resolvePlanFile(file))
  if (issues.length === 0) {
    process.stdout.write(`${file} is valid\n`)
    return
  }
  printIssues(file, issues)
  process.stdout.write(`\n${issues.length} issue(s) found\n`)
  process.exitCode = 1
}
