import { resolve } from 'node:path'
import { type CheckIssue, checkPlan } from '../build/check.js'

/** Print check issues in an editor-clickable `file:line:column  message` format. */
export function printIssues(file: string, issues: CheckIssue[]): void {
  for (const issue of issues) {
    process.stderr.write(`${file}:${issue.line}:${issue.column}  ${issue.message}\n`)
  }
}

/** `vplan check <file>` — validate a plan's MDX without rendering it. */
export async function runCheck(file: string): Promise<void> {
  const issues = await checkPlan(resolve(file))
  if (issues.length === 0) {
    process.stdout.write(`${file} is valid\n`)
    return
  }
  printIssues(file, issues)
  process.stdout.write(`\n${issues.length} issue(s) found\n`)
  process.exitCode = 1
}
