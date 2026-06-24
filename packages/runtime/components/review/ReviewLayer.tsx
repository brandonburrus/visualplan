import type { Feedback, ReviewComment, ReviewDecision } from '@visualplan/core'
import { IconCheck } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { CommentModal } from './CommentModal.js'
import { DecisionBar } from './DecisionBar.js'
import { beaconFeedback, isReviewMode, postFeedback } from './feedback.js'
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

  // The unload handlers register once but must see the latest state, so mirror it into a ref.
  const stateRef = useRef({ comments, note, submitted })
  stateRef.current = { comments, note, submitted }

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      // Prompt before leaving only while the review is unresolved; a submitted decision closes freely.
      if (!stateRef.current.submitted) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    // pagehide fires when the page is actually torn down (the user confirmed leaving), so this is the
    // "they really left" signal. Closing without a decision is a Deny, carrying any comments made.
    const onPageHide = () => {
      const { submitted: done, comments: made, note: overall } = stateRef.current
      if (!done) {
        beaconFeedback({ decision: 'deny', comments: made, note: overall.trim() || undefined })
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('pagehide', onPageHide)
    }
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
