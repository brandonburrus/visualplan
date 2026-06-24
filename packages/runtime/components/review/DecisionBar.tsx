import { IconCheck, IconRefresh, IconX } from '@tabler/icons-react'
import type { ReviewDecision } from '@visualplan/core'
import { reviewIteration } from './feedback.js'

/** A compact "2 comments, 1 answer" tally for the bar, or a prompt when nothing is staged yet. */
function feedbackSummary(commentCount: number, answerCount: number): string {
  const parts: string[] = []
  if (commentCount > 0) parts.push(`${commentCount} comment${commentCount === 1 ? '' : 's'}`)
  if (answerCount > 0) parts.push(`${answerCount} answer${answerCount === 1 ? '' : 's'}`)
  return parts.length === 0 ? 'No feedback yet' : parts.join(', ')
}

/**
 * The sticky decision bar. Approve and Deny always submit (feedback optional); Iterate requires at
 * least one comment, answer, or a general note, since "revise with feedback" needs feedback to act on.
 */
export function DecisionBar({
  commentCount,
  answerCount,
  note,
  onNote,
  onDecide,
  busy,
}: {
  commentCount: number
  answerCount: number
  note: string
  onNote: (note: string) => void
  onDecide: (decision: ReviewDecision) => void
  busy: boolean
}) {
  const canIterate = commentCount > 0 || answerCount > 0 || note.trim().length > 0
  const iteration = reviewIteration()

  return (
    <div className='vp-review-bar'>
      <div className='vp-review-bar__meta'>
        {iteration !== null && (
          <span className='vp-review-bar__iteration'>Iteration {iteration}</span>
        )}
        <input
          className='vp-review-bar__note'
          placeholder='Optional overall note'
          value={note}
          onChange={event => onNote(event.target.value)}
          aria-label='Optional overall note'
        />
        <span className='vp-review-bar__count'>{feedbackSummary(commentCount, answerCount)}</span>
      </div>
      <div className='vp-review-bar__actions'>
        <button
          type='button'
          className='vp-review-decision vp-review-decision--deny'
          onClick={() => onDecide('deny')}
          disabled={busy}
        >
          <IconX size={16} /> Deny
        </button>
        <button
          type='button'
          className='vp-review-decision vp-review-decision--iterate'
          onClick={() => onDecide('iterate')}
          disabled={busy || !canIterate}
          title={canIterate ? undefined : 'Add a comment or a note to iterate'}
        >
          <IconRefresh size={16} /> Iterate
        </button>
        <button
          type='button'
          className='vp-review-decision vp-review-decision--approve'
          onClick={() => onDecide('approve')}
          disabled={busy}
        >
          <IconCheck size={16} /> Approve
        </button>
      </div>
    </div>
  )
}
