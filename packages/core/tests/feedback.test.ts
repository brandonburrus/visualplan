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
