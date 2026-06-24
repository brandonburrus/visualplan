import type { Feedback, ReviewAnswer, ReviewComment, ReviewDecision } from '@visualplan/core'
import { IconCheck, IconMessagePlus } from '@tabler/icons-react'
import { useEffect, useRef, useState } from 'react'
import { CommentModal } from './CommentModal.js'
import { CommentsPopover } from './CommentsPopover.js'
import { DecisionBar } from './DecisionBar.js'
import { isReviewMode, openKeepalive, postDraft, postFeedback } from './feedback.js'
import { useQuestionAnswers } from './ReviewAnswers.js'
import {
  type Section,
  sectionAt,
  SectionOverlays,
  useReviewSections,
  useTextSelection,
} from './SectionComments.js'
import './review.css'

/** A pending comment, keyed by section index (labels repeat). `quote`/`range` are set for a
 * selection comment; `range` lets the quoted text stay highlighted after the comment is added. */
interface DraftComment {
  sectionIndex: number
  label: string
  body: string
  quote?: string
  range?: Range
}

/** What a new comment will attach to: a section, optionally narrowed to a quoted text selection. */
interface CommentTarget {
  sectionIndex: number
  label: string
  quote?: string
  range?: Range
}

/** Turn the answer map into the feedback payload, dropping questions left blank. */
function collectAnswers(answers: Map<string, string> | undefined): ReviewAnswer[] {
  if (!answers) return []
  const result: ReviewAnswer[] = []
  for (const [question, answer] of answers) {
    const trimmed = answer.trim()
    if (trimmed) result.push({ question, answer: trimmed })
  }
  return result
}

/** Mounts the interactive review UI, but only when the CLI started the page in review mode. */
export function ReviewLayer() {
  if (!isReviewMode()) return null
  return <ReviewSession />
}

function ReviewSession() {
  const [comments, setComments] = useState<DraftComment[]>([])
  const [composing, setComposing] = useState<CommentTarget | null>(null)
  const [viewing, setViewing] = useState<Section | null>(null)
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState<ReviewDecision | null>(null)
  const [busy, setBusy] = useState(false)
  const [hoveredMark, setHoveredMark] = useState<{
    body: string
    top: number
    left: number
  } | null>(null)

  const { sections, hoveredIndex } = useReviewSections(submitted === null)
  const { selection, clear: clearSelection } = useTextSelection(submitted === null)
  const questionAnswers = useQuestionAnswers()

  // A selection comment is sent under its quote so the agent can locate the exact text; a section
  // comment is sent under the section label.
  const payloadComments: ReviewComment[] = comments.map(c => ({
    section: c.quote ?? c.label,
    body: c.body,
  }))
  // Answered questions (those with non-blank text) ride the distinct `answers` channel, keyed by the
  // question so the agent maps each back to the plan's `Questions`.
  const payloadAnswers: ReviewAnswer[] = collectAnswers(questionAnswers?.answers)
  const commentCounts = new Map<number, number>()
  for (const comment of comments) {
    commentCounts.set(comment.sectionIndex, (commentCounts.get(comment.sectionIndex) ?? 0) + 1)
  }

  // Hold a connection open so the server resolves Deny if the tab closes; the server, not an
  // unreliable unload beacon, detects the drop. Aborted on unmount (e.g. after a submitted decision).
  useEffect(() => {
    const connection = openKeepalive()
    return () => connection.abort()
  }, [])

  // Keep the server's Deny-on-close payload current, so a tab-close Deny still carries the comments
  // and answers. Build the payload inside the effect so it runs only when the state actually changes.
  const answersMap = questionAnswers?.answers
  useEffect(() => {
    if (!submitted) {
      const draft = comments.map(c => ({ section: c.quote ?? c.label, body: c.body }))
      postDraft({
        decision: 'deny',
        comments: draft,
        answers: collectAnswers(answersMap),
        note: note.trim() || undefined,
      })
    }
  }, [comments, note, answersMap, submitted])

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
    if (composing) {
      const t = composing
      setComments(prev => [
        ...prev,
        { sectionIndex: t.sectionIndex, label: t.label, body, quote: t.quote, range: t.range },
      ])
    }
    setComposing(null)
  }

  /** Comment on the current text selection: anchor it to the section it sits in, carrying the quote
   * and the range (so the text stays marked afterwards). */
  const addSelectionComment = () => {
    if (!selection) return
    const target = sectionAt(sections, selection.range.getBoundingClientRect().top) ?? sections[0]
    if (!target) return
    const quote =
      selection.text.length > 140 ? `${selection.text.slice(0, 140).trim()}…` : selection.text
    setViewing(null)
    setComposing({ sectionIndex: target.index, label: target.label, quote, range: selection.range })
    clearSelection()
  }

  /** Remove the `bodyIndex`-th comment among those on `sectionIndex`. */
  const deleteComment = (sectionIndex: number, bodyIndex: number) => {
    setComments(prev => {
      let seen = -1
      return prev.filter(comment => {
        if (comment.sectionIndex !== sectionIndex) return true
        seen += 1
        return seen !== bodyIndex
      })
    })
  }

  const decide = async (decision: ReviewDecision) => {
    const feedback: Feedback = {
      decision,
      comments: payloadComments,
      answers: payloadAnswers,
      note: note.trim() || undefined,
    }
    setBusy(true)
    const ok = await postFeedback(feedback)
    if (ok) {
      // Mark submitted on the ref synchronously so the beforeunload guard does not prompt for this
      // programmatic close (it still prompts on a manual browser close while undecided).
      submittedRef.current = decision
      setSubmitted(decision)
      // Best-effort: close the tab now the review is done. Browsers block this for a user-opened
      // tab, in which case the SubmittedNotice fallback tells them they can close it.
      window.close()
    } else {
      setBusy(false)
      window.alert('Could not reach the review server. Is the CLI still running?')
    }
  }

  if (submitted) return <SubmittedNotice decision={submitted} />

  const viewingComments = viewing
    ? comments
        .filter(comment => comment.sectionIndex === viewing.index)
        .map(c => ({ body: c.body, quote: c.quote }))
    : []
  const viewingRect = viewing?.element.getBoundingClientRect()
  const selectionRect = selection?.range.getBoundingClientRect()

  return (
    <>
      {/* Persistent highlight over text that has a comment, so it is obvious where one was added. A
          range can wrap lines, hence one mark per client rect. */}
      {comments.map((comment, ci) =>
        comment.range
          ? Array.from(comment.range.getClientRects()).map((r, ri) => (
              <button
                type='button'
                // biome-ignore lint/suspicious/noArrayIndexKey: positional marks, no stable id.
                key={`${ci}-${ri}`}
                className='vp-review-quote-mark'
                style={{ top: r.top, left: r.left, width: r.width, height: r.height }}
                onMouseEnter={() =>
                  setHoveredMark({ body: comment.body, top: r.top, left: r.left })
                }
                onMouseLeave={() => setHoveredMark(null)}
                onFocus={() => setHoveredMark({ body: comment.body, top: r.top, left: r.left })}
                onBlur={() => setHoveredMark(null)}
                onClick={() => {
                  const section = sections[comment.sectionIndex]
                  if (section) {
                    setComposing(null)
                    setViewing(section)
                  }
                }}
                aria-label={`Comment: ${comment.body}`}
              />
            ))
          : null,
      )}
      {hoveredMark && (
        <div
          className='vp-review-tip'
          style={{
            top: Math.max(hoveredMark.top - 38, 8),
            left: Math.min(hoveredMark.left, window.innerWidth - 360),
          }}
        >
          {hoveredMark.body}
        </div>
      )}
      <SectionOverlays
        sections={sections}
        hoveredIndex={hoveredIndex}
        commentCounts={commentCounts}
        onAdd={section => {
          setViewing(null)
          setComposing({ sectionIndex: section.index, label: section.label })
        }}
        onView={section => {
          setComposing(null)
          setViewing(section)
        }}
      />
      {selection && selectionRect && !composing && (
        <button
          type='button'
          className='vp-review-select'
          style={{
            top: Math.max(selectionRect.top - 36, 8),
            left: Math.min(Math.max(selectionRect.left, 8), window.innerWidth - 130),
          }}
          // Keep the text selection from collapsing when the button takes the press.
          onMouseDown={event => event.preventDefault()}
          onClick={addSelectionComment}
        >
          <IconMessagePlus size={14} /> Comment
        </button>
      )}
      {composing && (
        <CommentModal
          section={composing.quote ?? composing.label}
          onSave={addComment}
          onCancel={() => setComposing(null)}
        />
      )}
      {viewing && viewingRect && viewingComments.length > 0 && (
        <CommentsPopover
          label={viewing.label}
          comments={viewingComments}
          anchor={{ top: viewingRect.top, left: Math.max(viewingRect.left - 34, 8) }}
          onDelete={index => deleteComment(viewing.index, index)}
          onClose={() => setViewing(null)}
        />
      )}
      <DecisionBar
        commentCount={comments.length}
        answerCount={payloadAnswers.length}
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
