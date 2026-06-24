import { buildShareUrl } from '@visualplan/core/share'
import { checkSource } from '../build/check.js'
import { printIssues } from './check.js'
import { readPlanSource } from './input.js'

/**
 * `vplan share [file]` — print a stateless `visualplan.dev/view?data=...` link for a plan, reading
 * its MDX from a file, an explicit `-`, or piped stdin. The plan is validated first: the link
 * recompiles in-browser at view time, so a broken plan would render a broken view for the recipient.
 * On issues it prints them to stderr and exits 1 without emitting a URL, keeping stdout clean.
 */
export async function runShare(file?: string): Promise<void> {
  const { source, label } = await readPlanSource(file)

  const issues = await checkSource(source)
  if (issues.length > 0) {
    printIssues(label, issues)
    process.stderr.write(`\n${issues.length} issue(s) found\n`)
    process.exitCode = 1
    return
  }

  process.stdout.write(`${buildShareUrl(source)}\n`)
}
