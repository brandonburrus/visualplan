import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReviewLayer } from '../components/review/ReviewLayer.js'

type ReviewGlobal = {
  __VP_REVIEW__?: boolean
  __VP_REVIEW_PLAN_ID__?: string
  __VP_REVIEW_DECIDED__?: string
}

function setReview(plan: string | undefined): void {
  ;(globalThis as ReviewGlobal).__VP_REVIEW__ = true
  ;(globalThis as ReviewGlobal).__VP_REVIEW_PLAN_ID__ = plan
}

let container: HTMLDivElement
let root: Root
let fetchMock: ReturnType<typeof vi.fn>
let closeSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  container = document.createElement('div')
  container.className = 'vp-main'
  document.body.appendChild(container)
  fetchMock = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchMock)
  closeSpy = vi.fn()
  vi.stubGlobal('close', closeSpy)
})

afterEach(() => {
  act(() => root?.unmount())
  container.remove()
  ;(globalThis as ReviewGlobal).__VP_REVIEW__ = undefined
  ;(globalThis as ReviewGlobal).__VP_REVIEW_PLAN_ID__ = undefined
  ;(globalThis as ReviewGlobal).__VP_REVIEW_DECIDED__ = undefined
  vi.restoreAllMocks()
})

/** URLs of every fetch call made so far. */
function fetchedUrls(): string[] {
  return fetchMock.mock.calls.map(call => String(call[0]))
}

/** Drive an Approve click through the rendered decision bar. */
async function clickApprove(): Promise<void> {
  const approve = Array.from(container.querySelectorAll('button')).find(
    b => b.textContent?.trim() === 'Approve',
  )
  if (!approve) throw new Error('Approve button not found')
  await act(async () => {
    approve.click()
  })
}

describe('ReviewLayer queue mode', () => {
  it('does not open the daemon keepalive in queue mode (golden)', () => {
    setReview('plan-7')
    root = createRoot(container)
    act(() => root.render(<ReviewLayer />))
    expect(fetchedUrls()).not.toContain('/__vp_alive')
  })

  it('opens the keepalive in standalone mode (edge)', () => {
    setReview(undefined)
    root = createRoot(container)
    act(() => root.render(<ReviewLayer />))
    expect(fetchedUrls()).toContain('/__vp_alive')
  })

  it('submits feedback without closing the tab in queue mode (golden)', async () => {
    setReview('plan-7')
    root = createRoot(container)
    act(() => root.render(<ReviewLayer />))
    await clickApprove()
    const feedbackCall = fetchMock.mock.calls.find(c => String(c[0]) === '/__vp_feedback')
    expect(feedbackCall).toBeDefined()
    const body = JSON.parse((feedbackCall?.[1] as RequestInit).body as string)
    expect(body.planId).toBe('plan-7')
    expect(closeSpy).not.toHaveBeenCalled()
    // Locks the verdict on the bar, and does not tell the user to close the (still-needed) tab.
    expect(container.textContent).toContain('Approved')
    expect(container.textContent).not.toContain('close this tab')
  })

  it('opens an already-decided plan locked into its verdict, no controls or close-tab (golden)', () => {
    setReview('plan-7')
    ;(globalThis as ReviewGlobal).__VP_REVIEW_DECIDED__ = 'deny'
    root = createRoot(container)
    act(() => root.render(<ReviewLayer />))
    const buttonLabels = Array.from(container.querySelectorAll('button')).map(b =>
      b.textContent?.trim(),
    )
    expect(buttonLabels).not.toContain('Approve')
    expect(container.textContent).toContain('Denied')
    expect(container.textContent).not.toContain('close this tab')
  })

  it('still says to close the tab after submit in standalone mode (error)', async () => {
    setReview(undefined)
    root = createRoot(container)
    act(() => root.render(<ReviewLayer />))
    await clickApprove()
    expect(closeSpy).toHaveBeenCalled()
    expect(container.textContent).toContain('close this tab')
  })
})
