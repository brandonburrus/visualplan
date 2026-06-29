// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { type ReviewServer, startReviewServer } from '../src/build/compile.js'
import { parseIteration, parseTimeout, rendersReview, runRender } from '../src/commands/render.js'
import { exitCodeFor, formatFeedback } from '../src/review/format.js'

const PLAN = '# Plan\n\ntext\n'

function feedbackUrl(server: ReviewServer): string {
  return new URL('/__vp_feedback', server.url).href
}

describe('formatFeedback', () => {
  it('renders decision, comments, answers, and note as readable text (golden)', () => {
    const text = formatFeedback({
      decision: 'iterate',
      comments: [{ section: 'Phase 2', body: 'fix this' }],
      answers: [{ question: 'Fail open or closed?', answer: 'Fail closed' }],
      note: 'overall good',
    })
    expect(text).toContain('DECISION: iterate')
    expect(text).toContain('Comment on "Phase 2":')
    expect(text).toContain('  fix this')
    expect(text).toContain('Answer to "Fail open or closed?":')
    expect(text).toContain('  Fail closed')
    expect(text).toContain('General note:')
    expect(text).toContain('  overall good')
  })

  it('orders comments before answers before the note (golden)', () => {
    const text = formatFeedback({
      decision: 'iterate',
      comments: [{ section: 'Phase 1', body: 'c' }],
      answers: [{ question: 'q', answer: 'a' }],
      note: 'n',
    })
    expect(text.indexOf('Comment on')).toBeLessThan(text.indexOf('Answer to'))
    expect(text.indexOf('Answer to')).toBeLessThan(text.indexOf('General note'))
  })

  it('renders a bare approve with no comments, answers, or note (edge)', () => {
    expect(formatFeedback({ decision: 'approve', comments: [], answers: [] })).toBe(
      'DECISION: approve',
    )
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

describe('parseIteration', () => {
  it('parses a positive integer (golden)', () => {
    expect(parseIteration('3')).toBe(3)
  })

  it('rejects zero, negatives, and non-integers (error + edge)', () => {
    expect(() => parseIteration('0')).toThrow(/positive integer/)
    expect(() => parseIteration('-1')).toThrow()
    expect(() => parseIteration('1.5')).toThrow()
    expect(() => parseIteration('two')).toThrow()
  })
})

describe('rendersReview (review is the default)', () => {
  it('defaults to review with no flags, and when --review is explicit (golden)', () => {
    expect(rendersReview({})).toBe(true)
    expect(rendersReview({ review: true })).toBe(true)
  })

  it('opts out of review for any static output flag (golden)', () => {
    expect(rendersReview({ static: true })).toBe(false)
    expect(rendersReview({ watch: true })).toBe(false)
    expect(rendersReview({ stdout: true })).toBe(false)
    expect(rendersReview({ out: 'plan.html' })).toBe(false)
  })

  it('keeps review when only review-adjacent flags are set (edge)', () => {
    // --no-daemon, --iteration, --timeout, and --diff all refine a review; they do not opt out.
    expect(rendersReview({ noDaemon: true, iteration: 2, timeout: 1000, diff: false })).toBe(true)
  })
})

describe('runRender --review guards', () => {
  it('rejects --review combined with an output flag (error)', async () => {
    await expect(runRender('plan.mdx', { review: true, stdout: true })).rejects.toThrow(
      /--review cannot be combined/,
    )
  })

  it('rejects --review combined with --static (error)', async () => {
    await expect(runRender('plan.mdx', { review: true, static: true })).rejects.toThrow(
      /--review cannot be combined with --static/,
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
    await expect(server.feedback).resolves.toEqual({
      decision: 'approve',
      comments: [],
      answers: [],
    })
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

describe('startReviewServer tab-close (keepalive drop)', () => {
  let server: ReviewServer

  afterEach(async () => {
    await server?.close()
  })

  /** Open the keepalive connection and abort it, simulating the tab closing. */
  async function dropAfterConnecting(server: ReviewServer): Promise<void> {
    const controller = new AbortController()
    void fetch(new URL('/__vp_alive', server.url), { signal: controller.signal }).catch(() => {})
    await new Promise(resolve => setTimeout(resolve, 150))
    controller.abort()
  }

  it('resolves a bare Deny when the connection drops with no draft (golden)', async () => {
    server = await startReviewServer(PLAN)
    await dropAfterConnecting(server)
    await expect(server.feedback).resolves.toEqual({
      decision: 'deny',
      comments: [],
      answers: [],
    })
  }, 60_000)

  it('carries the synced draft comments into the tab-close Deny (golden)', async () => {
    server = await startReviewServer(PLAN)
    const draft = {
      decision: 'deny',
      comments: [{ section: 'Phase 1', body: 'unfinished' }],
      answers: [],
    }
    await fetch(new URL('/__vp_draft', server.url), { method: 'POST', body: JSON.stringify(draft) })
    await dropAfterConnecting(server)
    await expect(server.feedback).resolves.toEqual(draft)
  }, 60_000)

  it('lets an explicit decision win over a later connection drop (edge)', async () => {
    server = await startReviewServer(PLAN)
    await fetch(feedbackUrl(server), {
      method: 'POST',
      body: JSON.stringify({ decision: 'approve' }),
    })
    await dropAfterConnecting(server)
    // The POST settled first; the drop must not override it.
    await expect(server.feedback).resolves.toEqual({
      decision: 'approve',
      comments: [],
      answers: [],
    })
  }, 60_000)

  it('closes promptly while the keepalive is still open, so the CLI never hangs (regression)', async () => {
    const live = await startReviewServer(PLAN)
    const controller = new AbortController()
    void fetch(new URL('/__vp_alive', live.url), { signal: controller.signal }).catch(() => {})
    await new Promise(resolve => setTimeout(resolve, 150))
    await fetch(new URL('/__vp_feedback', live.url), {
      method: 'POST',
      body: JSON.stringify({ decision: 'approve' }),
    })
    await live.feedback
    // The held-open keepalive must not keep close() (and therefore the process) from finishing.
    const outcome = await Promise.race([
      live.close().then(() => 'closed'),
      new Promise(resolve => setTimeout(() => resolve('hung'), 3_000)),
    ])
    controller.abort()
    expect(outcome).toBe('closed')
  }, 60_000)
})
