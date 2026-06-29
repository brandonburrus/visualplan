import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isQueueMode,
  postDraft,
  postFeedback,
  reviewDecided,
  reviewPlanId,
} from '../components/review/feedback.js'

type QueueGlobal = { __VP_REVIEW_PLAN_ID__?: string; __VP_REVIEW_DECIDED__?: string }

function setPlanId(id: string | undefined): void {
  ;(globalThis as QueueGlobal).__VP_REVIEW_PLAN_ID__ = id
}

afterEach(() => {
  setPlanId(undefined)
  ;(globalThis as QueueGlobal).__VP_REVIEW_DECIDED__ = undefined
  vi.restoreAllMocks()
})

describe('reviewDecided', () => {
  it('returns the injected verdict of an already-decided plan (golden)', () => {
    ;(globalThis as QueueGlobal).__VP_REVIEW_DECIDED__ = 'iterate'
    expect(reviewDecided()).toBe('iterate')
  })

  it('returns null when absent (edge)', () => {
    ;(globalThis as QueueGlobal).__VP_REVIEW_DECIDED__ = undefined
    expect(reviewDecided()).toBeNull()
  })

  it('returns null for an unrecognized value (error)', () => {
    ;(globalThis as QueueGlobal).__VP_REVIEW_DECIDED__ = 'maybe'
    expect(reviewDecided()).toBeNull()
  })
})

describe('reviewPlanId', () => {
  it('returns the injected plan id in queue mode (golden)', () => {
    setPlanId('plan-7')
    expect(reviewPlanId()).toBe('plan-7')
  })

  it('returns null when the global is absent (edge)', () => {
    setPlanId(undefined)
    expect(reviewPlanId()).toBeNull()
  })

  it('returns null for an empty id, which cannot route (error)', () => {
    setPlanId('')
    expect(reviewPlanId()).toBeNull()
  })
})

describe('isQueueMode', () => {
  it('is true when a non-empty plan id is present (golden)', () => {
    setPlanId('plan-7')
    expect(isQueueMode()).toBe(true)
  })

  it('is false when the global is absent (edge)', () => {
    setPlanId(undefined)
    expect(isQueueMode()).toBe(false)
  })

  it('is false for an empty id (error)', () => {
    setPlanId('')
    expect(isQueueMode()).toBe(false)
  })
})

/** Parse the JSON body the most recent fetch mock call was given. */
function lastFetchBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = fetchMock.mock.calls.at(-1)
  if (!call) throw new Error('fetch was not called')
  return JSON.parse((call[1] as RequestInit).body as string)
}

describe('postFeedback queue-mode tagging', () => {
  it('includes planId in the body in queue mode (golden)', async () => {
    setPlanId('plan-7')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    await postFeedback({ decision: 'approve', comments: [], answers: [] })
    expect(lastFetchBody(fetchMock).planId).toBe('plan-7')
  })

  it('omits planId in standalone mode (edge)', async () => {
    setPlanId(undefined)
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    await postFeedback({ decision: 'approve', comments: [], answers: [] })
    expect('planId' in lastFetchBody(fetchMock)).toBe(false)
  })

  it('omits planId for an empty injected id (error)', async () => {
    setPlanId('')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    await postFeedback({ decision: 'approve', comments: [], answers: [] })
    expect('planId' in lastFetchBody(fetchMock)).toBe(false)
  })
})

describe('postDraft queue-mode tagging', () => {
  it('includes planId in the body in queue mode (golden)', () => {
    setPlanId('plan-7')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    postDraft({ decision: 'deny', comments: [], answers: [] })
    expect(lastFetchBody(fetchMock).planId).toBe('plan-7')
  })

  it('omits planId in standalone mode (edge)', () => {
    setPlanId(undefined)
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    postDraft({ decision: 'deny', comments: [], answers: [] })
    expect('planId' in lastFetchBody(fetchMock)).toBe(false)
  })

  it('omits planId for an empty injected id (error)', () => {
    setPlanId('')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    postDraft({ decision: 'deny', comments: [], answers: [] })
    expect('planId' in lastFetchBody(fetchMock)).toBe(false)
  })
})
