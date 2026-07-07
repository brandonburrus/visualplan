import type { ReviewSeverity } from '@visualplan/core'
import { IconTrash, IconX } from '@tabler/icons-react'

/** How a severity value reads on the small mark tooltip / popover tags. */
export const SEVERITY_LABEL: Record<ReviewSeverity, string> = {
  'must-fix': 'must fix',
  suggestion: 'suggestion',
}

/** One comment shown in the popover. `quote` is set when the comment targets selected text. */
export interface PopoverComment {
  body: string
  /** The quoted text, when this comment was made on a selection rather than the whole section. */
  quote?: string
  /** The reviewer's severity tag, when one was chosen in the composer. */
  severity?: ReviewSeverity
}

/**
 * A small panel listing the comments on one section, so the reviewer can see what they wrote where
 * (and remove a comment). Anchored to the section it belongs to; the caller positions it. In
 * `readOnly` mode (after a decision) the list is view-only: no delete affordance.
 */
export function CommentsPopover({
  label,
  comments,
  anchor,
  readOnly,
  onDelete,
  onClose,
}: {
  label: string
  comments: PopoverComment[]
  anchor: { top: number; left: number }
  readOnly?: boolean
  onDelete: (index: number) => void
  onClose: () => void
}) {
  return (
    <div
      className='vp-review-popover'
      style={{ top: anchor.top, left: anchor.left }}
      role='dialog'
      aria-label={`Comments on ${label}`}
    >
      <div className='vp-review-popover__head'>
        <span className='vp-review-popover__title'>
          Comments on <strong>{label}</strong>
        </span>
        <button
          type='button'
          className='vp-review-popover__close'
          onClick={onClose}
          aria-label='Close'
        >
          <IconX size={14} />
        </button>
      </div>
      <ul className='vp-review-popover__list'>
        {comments.map((comment, index) => (
          // Comments have no id; index is stable within this render and the list is short.
          // biome-ignore lint/suspicious/noArrayIndexKey: positional list, no stable id available.
          <li key={index} className='vp-review-popover__item'>
            <div className='vp-review-popover__text'>
              {comment.severity && (
                <span className='vp-review-tag' data-severity={comment.severity}>
                  {SEVERITY_LABEL[comment.severity]}
                </span>
              )}
              {comment.quote && <span className='vp-review-popover__quote'>“{comment.quote}”</span>}
              <span>{comment.body}</span>
            </div>
            {!readOnly && (
              <button
                type='button'
                className='vp-review-popover__delete'
                onClick={() => onDelete(index)}
                aria-label='Delete comment'
              >
                <IconTrash size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
