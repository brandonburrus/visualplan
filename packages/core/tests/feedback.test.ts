import { describe, expect, it } from 'vitest'
import { feedbackSchema, reviewAnswerSchema } from '../src/index.js'

describe('reviewAnswerSchema', () => {
  it('accepts a question paired with an answer (golden)', () => {
    const answer = { question: 'Fail open or closed?', answer: 'Fail closed' }
    expect(reviewAnswerSchema.parse(answer)).toEqual(answer)
  })

  it('rejects an empty question or empty answer (error)', () => {
    expect(() => reviewAnswerSchema.parse({ question: '', answer: 'x' })).toThrow()
    expect(() => reviewAnswerSchema.parse({ question: 'x', answer: '' })).toThrow()
  })
})

describe('feedbackSchema answers', () => {
  it('defaults answers to empty when omitted (edge)', () => {
    expect(feedbackSchema.parse({ decision: 'approve' })).toEqual({
      decision: 'approve',
      comments: [],
      answers: [],
    })
  })

  it('keeps supplied answers alongside comments (golden)', () => {
    const parsed = feedbackSchema.parse({
      decision: 'iterate',
      comments: [{ section: 'Phase 1', body: 'tweak' }],
      answers: [{ question: 'TTL ok?', answer: 'Yes, 15m' }],
    })
    expect(parsed.answers).toEqual([{ question: 'TTL ok?', answer: 'Yes, 15m' }])
  })
})

describe('reviewCommentSchema severity', () => {
  it('carries an optional must-fix or suggestion tag (golden)', () => {
    const parsed = feedbackSchema.parse({
      decision: 'iterate',
      comments: [
        { section: 'Phase 1', body: 'wrong table', severity: 'must-fix' },
        { section: 'Phase 2', body: 'maybe rename', severity: 'suggestion' },
      ],
    })
    expect(parsed.comments.map(c => c.severity)).toEqual(['must-fix', 'suggestion'])
  })

  it('leaves severity undefined when untagged (edge)', () => {
    const parsed = feedbackSchema.parse({
      decision: 'iterate',
      comments: [{ section: 'Phase 1', body: 'tweak' }],
    })
    expect(parsed.comments[0]?.severity).toBeUndefined()
  })

  it('rejects an unknown severity (error)', () => {
    expect(() =>
      feedbackSchema.parse({
        decision: 'iterate',
        comments: [{ section: 'Phase 1', body: 'x', severity: 'blocking' }],
      }),
    ).toThrow()
  })
})

describe('feedbackSchema planId', () => {
  it('carries a planId when the Review Queue tags the feedback (golden)', () => {
    const parsed = feedbackSchema.parse({ decision: 'approve', planId: 'p-1' })
    expect(parsed.planId).toBe('p-1')
  })

  it('omits planId for a standalone single review (edge)', () => {
    expect(feedbackSchema.parse({ decision: 'approve' }).planId).toBeUndefined()
  })

  it('rejects an empty planId (error)', () => {
    expect(() => feedbackSchema.parse({ decision: 'approve', planId: '' })).toThrow()
  })
})
