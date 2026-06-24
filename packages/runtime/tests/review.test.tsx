import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { isReviewMode } from '../components/review/feedback.js'
import { DecisionBar } from '../components/review/DecisionBar.js'
import { ReviewLayer } from '../components/review/ReviewLayer.js'

function setReviewMode(on: boolean): void {
  ;(globalThis as { __VP_REVIEW__?: boolean }).__VP_REVIEW__ = on || undefined
}

afterEach(() => setReviewMode(false))

describe('ReviewLayer gating', () => {
  it('renders nothing outside review mode (edge)', () => {
    setReviewMode(false)
    expect(renderToStaticMarkup(<ReviewLayer />)).toBe('')
  })

  it('mounts the decision bar in review mode (golden)', () => {
    setReviewMode(true)
    const html = renderToStaticMarkup(<ReviewLayer />)
    expect(html).toContain('vp-review-bar')
    expect(html).toContain('Approve')
    expect(html).toContain('Deny')
    expect(html).toContain('Iterate')
  })
})

describe('isReviewMode', () => {
  it('reflects the injected flag (golden + edge)', () => {
    setReviewMode(false)
    expect(isReviewMode()).toBe(false)
    setReviewMode(true)
    expect(isReviewMode()).toBe(true)
  })
})

describe('DecisionBar Iterate gating', () => {
  const noop = () => {}

  it('disables Iterate with no comments, answers, or note (edge)', () => {
    const html = renderToStaticMarkup(
      <DecisionBar
        commentCount={0}
        answerCount={0}
        note=''
        onNote={noop}
        onDecide={noop}
        busy={false}
      />,
    )
    // Only the Iterate button is disabled; Deny and Approve are always actionable when not busy.
    expect((html.match(/disabled=""/g) || []).length).toBe(1)
  })

  it('enables Iterate once a comment exists (golden)', () => {
    const html = renderToStaticMarkup(
      <DecisionBar
        commentCount={1}
        answerCount={0}
        note=''
        onNote={noop}
        onDecide={noop}
        busy={false}
      />,
    )
    expect((html.match(/disabled=""/g) || []).length).toBe(0)
  })

  it('enables Iterate when only an answer exists (golden)', () => {
    const html = renderToStaticMarkup(
      <DecisionBar
        commentCount={0}
        answerCount={1}
        note=''
        onNote={noop}
        onDecide={noop}
        busy={false}
      />,
    )
    expect((html.match(/disabled=""/g) || []).length).toBe(0)
  })
})
