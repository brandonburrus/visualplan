import { REVIEW_SEVERITY_VALUES, type ReviewSeverity } from '@visualplan/core'
import { IconX } from '@tabler/icons-react'
import { useState } from 'react'

/** The composer's toggle labels; the payload keeps the schema's enum values. */
const SEVERITY_OPTION_LABEL: Record<ReviewSeverity, string> = {
  'must-fix': 'Must fix',
  suggestion: 'Suggestion',
}

/**
 * The bottom-of-screen composer for a single section comment. Saves on the button or Cmd/Ctrl+Enter,
 * cancels on Escape. Empty comments are not savable. The severity toggle defaults to untagged;
 * clicking the selected option again deselects it (untagged is the resting state, so no third
 * "none" control is needed).
 */
export function CommentModal({
  section,
  onSave,
  onCancel,
}: {
  section: string
  onSave: (body: string, severity?: ReviewSeverity) => void
  onCancel: () => void
}) {
  const [body, setBody] = useState('')
  const [severity, setSeverity] = useState<ReviewSeverity | undefined>(undefined)
  const trimmed = body.trim()

  const save = () => {
    if (trimmed) onSave(trimmed, severity)
  }

  return (
    <div className='vp-review-composer' role='dialog' aria-label={`Comment on ${section}`}>
      <div className='vp-review-composer__head'>
        <span className='vp-review-composer__target'>
          Comment on <strong>{section}</strong>
        </span>
        <button
          type='button'
          className='vp-review-composer__close'
          onClick={onCancel}
          aria-label='Cancel'
        >
          <IconX size={16} />
        </button>
      </div>
      <textarea
        className='vp-review-composer__input'
        // biome-ignore lint/a11y/noAutofocus: the composer opens on an explicit click, so focusing it is expected.
        autoFocus
        rows={3}
        placeholder='What should change here?'
        value={body}
        onChange={event => setBody(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Escape') onCancel()
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) save()
        }}
      />
      <div className='vp-review-composer__actions'>
        <fieldset className='vp-review-severity' aria-label='Comment severity'>
          {REVIEW_SEVERITY_VALUES.map(value => (
            <button
              key={value}
              type='button'
              className='vp-review-severity__option'
              aria-pressed={severity === value}
              onClick={() => setSeverity(prev => (prev === value ? undefined : value))}
            >
              {SEVERITY_OPTION_LABEL[value]}
            </button>
          ))}
        </fieldset>
        <button type='button' className='vp-review-btn' onClick={onCancel}>
          Cancel
        </button>
        <button
          type='button'
          className='vp-review-btn vp-review-btn--primary'
          onClick={save}
          disabled={!trimmed}
        >
          Add comment
        </button>
      </div>
    </div>
  )
}
