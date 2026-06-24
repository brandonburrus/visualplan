// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { type ReviewServer, startReviewServer } from '../src/build/compile.js'
import { parseTimeout, runRender } from '../src/commands/render.js'
import { exitCodeFor, formatFeedback } from '../src/review/format.js'

const PLAN = '# Plan\n\ntext\n'

function feedbackUrl(server: ReviewServer): string {
  return new URL('/__vp_feedback', server.url).href
}

describe('formatFeedback', () => {
  it('renders decision, comments, and note as readable text (golden)', () => {
    const text = formatFeedback({
      decision: 'iterate',
      comments: [{ section: 'Phase 2', body: 'fix this' }],
      note: 'overall good',
    })
    expect(text).toContain('DECISION: iterate')
    expect(text).toContain('Comment on "Phase 2":')
    expect(text).toContain('  fix this')
    expect(text).toContain('General note:')
    expect(text).toContain('  overall good')
  })

  it('renders a bare approve with no comments or note (edge)', () => {
    expect(formatFeedback({ decision: 'approve', comments: [] })).toBe('DECISION: approve')
  })
})

describe('exitCodeFor', () => {
  it('maps every outcome to its exit code (golden + edge)', () => {
    expect(exitCodeFor('approve')).toBe(0)
    expect(exitCodeFor('deny')).toBe(1)
    expect(exitCodeFor('iterate')).toBe(2)
    expect(exitCodeFor('timeout')).toBe(3)
  })
})

describe('parseTimeout', () => {
  it('parses a duration string to milliseconds (golden)', () => {
    expect(parseTimeout('15m')).toBe(900_000)
    expect(parseTimeout('30s')).toBe(30_000)
  })

  it('rejects an unparseable duration (error)', () => {
    expect(() => parseTimeout('soon')).toThrow(/positive duration/)
  })
})

describe('runRender --review guards', () => {
  it('rejects --review combined with an output flag (error)', async () => {
    await expect(runRender('plan.mdx', { review: true, stdout: true })).rejects.toThrow(
      /--review cannot be combined/,
    )
  })
})

describe('startReviewServer /__vp_feedback', () => {
  let server: ReviewServer

  afterEach(async () => {
    await server?.close()
  })

  it('resolves the feedback promise on a valid POST (golden)', async () => {
    server = await startReviewServer(PLAN)
    const payload = { decision: 'iterate', comments: [{ section: 'Phase 1', body: 'tweak' }] }
    const res = await fetch(feedbackUrl(server), { method: 'POST', body: JSON.stringify(payload) })
    expect(res.status).toBe(200)
    await expect(server.feedback).resolves.toMatchObject({
      decision: 'iterate',
      comments: [{ section: 'Phase 1', body: 'tweak' }],
    })
  }, 60_000)

  it('defaults comments to empty for a bare decision (edge)', async () => {
    server = await startReviewServer(PLAN)
    await fetch(feedbackUrl(server), {
      method: 'POST',
      body: JSON.stringify({ decision: 'approve' }),
    })
    await expect(server.feedback).resolves.toEqual({ decision: 'approve', comments: [] })
  }, 60_000)

  it('rejects an invalid body with 400 and leaves feedback pending (error)', async () => {
    server = await startReviewServer(PLAN)
    const res = await fetch(feedbackUrl(server), { method: 'POST', body: '{"decision":"nope"}' })
    expect(res.status).toBe(400)
    const outcome = await Promise.race([
      server.feedback.then(() => 'resolved'),
      new Promise(resolve => setTimeout(() => resolve('pending'), 250)),
    ])
    expect(outcome).toBe('pending')
  }, 60_000)

  it('rejects a non-POST request with 405 (error)', async () => {
    server = await startReviewServer(PLAN)
    const res = await fetch(feedbackUrl(server))
    expect(res.status).toBe(405)
  }, 60_000)
})
