import ms from 'ms'
import open from 'open'
import { startReviewServer } from '../build/compile.js'
import type { Theme } from '../config.js'
import { exitCodeFor, formatFeedback } from './format.js'

/** Exit code for a Ctrl+C cancel: the conventional 128 + SIGINT(2). */
const SIGINT_EXIT = 130

/**
 * Run an interactive review session: serve the plan, open it, and block until the reviewer submits a
 * decision (via the page) or `timeoutMs` elapses. The feedback is printed to **stdout** (the calling
 * agent reads it) while status and the URL go to **stderr**, so a captured stdout is exactly the
 * feedback. Sets `process.exitCode` from the outcome (approve 0, deny 1, iterate 2, timeout 3).
 */
export async function runReview(
  source: string,
  theme: Theme,
  timeoutMs: number,
  openBrowser: boolean,
  iteration?: number,
  baseline?: string,
): Promise<void> {
  const server = await startReviewServer(source, theme, iteration, baseline)
  process.stderr.write(
    `Visual Plan review at\n  ${server.url}\n  (comment on sections, then Approve / Deny / Iterate; Ctrl+C to cancel)\n`,
  )
  if (openBrowser) await open(server.url)

  // Ctrl+C must release the port and exit, or the dev server keeps the process alive.
  const onSigint = () => {
    void server.close().finally(() => process.exit(SIGINT_EXIT))
  }
  process.once('SIGINT', onSigint)

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>(resolve => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs)
  })

  try {
    const result = await Promise.race([server.feedback, timeout])
    if (result === 'timeout') {
      process.stderr.write(
        `\nReview timed out after ${ms(timeoutMs, { long: true })} with no response.\n`,
      )
      process.exitCode = exitCodeFor('timeout')
      return
    }
    process.stdout.write(`${formatFeedback(result)}\n`)
    process.exitCode = exitCodeFor(result.decision)
  } finally {
    clearTimeout(timer)
    process.off('SIGINT', onSigint)
    await server.close()
  }
}
