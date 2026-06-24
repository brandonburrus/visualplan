import type { Feedback, ReviewComment, ReviewDecision } from '@visualplan/core'
import { IconCheck } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { CommentModal } from './CommentModal.js'
import { DecisionBar } from './DecisionBar.js'
import { isReviewMode, openKeepalive, postDraft, postFeedback } from './feedback.js'
import { HoverCommentButton, useHoveredSection } from './SectionComments.js'
import './review.css'

/** Mounts the interactive review UI, but only when the CLI started the page in review mode. */
export function ReviewLayer() {
  if (!isReviewMode()) return null
  return <ReviewSession />
}

function ReviewSession() {
  const [comments, setComments] = useState<ReviewComment[]>([])
  const [composing, setComposing] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState<ReviewDecision | null>(null)
  const [busy, setBusy] = useState(false)

  const { hovered, keepAlive } = useHoveredSection(submitted === null)

  // Hold a connection open so the server resolves Deny if the tab closes; the server, not an
  // unreliable unload beacon, detects the drop. Aborted on unmount (e.g. after a submitted decision).
  useEffect(() => {
    const connection = openKeepalive()
    return () => connection.abort()
  }, [])

  // Keep the server's Deny-on-close payload current, so a tab-close Deny still carries the comments.
  useEffect(() => {
    if (!submitted) postDraft({ decision: 'deny', comments, note: note.trim() || undefined })
  }, [comments, note, submitted])

  // Warn before leaving while undecided; the actual Deny is handled server-side via the dropped
  // keepalive, so this prompt is purely a courtesy. It reads the latest `submitted` via a ref.
  const submittedRef = useRef(submitted)
  submittedRef.current = submitted
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!submittedRef.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  const addComment = (body: string) => {
    if (composing) setComments(prev => [...prev, { section: composing, body }])
    setComposing(null)
  }

  const decide = async (decision: ReviewDecision) => {
    const feedback: Feedback = { decision, comments, note: note.trim() || undefined }
    setBusy(true)
    const ok = await postFeedback(feedback)
    if (ok) {
      setSubmitted(decision)
    } else {
      setBusy(false)
      window.alert('Could not reach the review server. Is the CLI still running?')
    }
  }

  if (submitted) return <SubmittedNotice decision={submitted} />

  return (
    <>
      {hovered && !composing && (
        <HoverCommentButton
          section={hovered}
          onClick={() => setComposing(hovered.label)}
          onKeepAlive={keepAlive}
        />
      )}
      {composing && (
        <CommentModal section={composing} onSave={addComment} onCancel={() => setComposing(null)} />
      )}
      <DecisionBar
        commentCount={comments.length}
        note={note}
        onNote={setNote}
        onDecide={decide}
        busy={busy}
      />
    </>
  )
}

/** Replaces the decision bar once a verdict is sent, so the reviewer knows it is safe to close. */
function SubmittedNotice({ decision }: { decision: ReviewDecision }) {
  return (
    <div className='vp-review-done' data-decision={decision}>
      <IconCheck size={18} />
      <span>
        Feedback submitted (<strong>{decision}</strong>). You can close this tab.
      </span>
    </div>
  )
}
