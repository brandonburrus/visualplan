import type { Feedback, ReviewDecision } from '@visualplan/core'

/** The terminal outcomes of a review session and their CLI exit codes. `timeout` is distinct from
 * `deny` on purpose: "the human rejected" and "no human answered" are different situations for the
 * calling agent, which may retry on a timeout but must stop on a deny. */
export type ReviewOutcome = ReviewDecision | 'timeout'

const EXIT_CODES: Record<ReviewOutcome, number> = {
  approve: 0,
  deny: 1,
  iterate: 2,
  timeout: 3,
}

/** Map a review outcome to the process exit code the agent reads. */
export function exitCodeFor(outcome: ReviewOutcome): number {
  return EXIT_CODES[outcome]
}

/**
 * Render the feedback as a readable text block for the calling agent (an LLM reads it directly, so
 * this is plain prose, not JSON, consistent with the rest of the CLI's output).
 */
export function formatFeedback(feedback: Feedback): string {
  const lines: string[] = [`DECISION: ${feedback.decision}`]

  for (const comment of feedback.comments) {
    // The severity tag rides in the header so the agent can tell blocking must-fixes from
    // take-or-leave suggestions; an untagged comment prints exactly as before (old clients).
    const tag = comment.severity ? ` [${comment.severity}]` : ''
    lines.push('', `Comment on "${comment.section}"${tag}:`, indent(comment.body))
  }

  for (const answer of feedback.answers) {
    lines.push('', `Answer to "${answer.question}":`, indent(answer.answer))
  }

  if (feedback.note) {
    lines.push('', 'General note:', indent(feedback.note))
  }

  return lines.join('\n')
}

/** Indent every line of a comment body by two spaces so it reads as a nested block. */
function indent(text: string): string {
  return text
    .split('\n')
    .map(line => `  ${line}`)
    .join('\n')
}
