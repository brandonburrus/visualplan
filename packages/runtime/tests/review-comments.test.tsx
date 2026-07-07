import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReviewLayer } from '../components/review/ReviewLayer.js'

type ReviewGlobal = {
  __VP_REVIEW__?: boolean
  __VP_REVIEW_PLAN_ID__?: string
}

// The section hover flows through a plain document `pointermove` listener, so its state updates
// need a real act environment to flush (React events happen to flush without it; these do not).
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let main: HTMLDivElement
let overlayHost: HTMLDivElement
let root: Root
let fetchMock: ReturnType<typeof vi.fn>

/** jsdom does no layout, so stub the box an element reports for the section band math. */
function stubRect(el: Element, top: number, bottom: number): void {
  el.getBoundingClientRect = () =>
    ({
      top,
      bottom,
      left: 20,
      right: 400,
      width: 380,
      height: bottom - top,
      x: 20,
      y: top,
    }) as DOMRect
}

beforeEach(() => {
  ;(globalThis as ReviewGlobal).__VP_REVIEW__ = true
  ;(globalThis as ReviewGlobal).__VP_REVIEW_PLAN_ID__ = 'plan-7'
  // The plan column: `createRoot(...).render` wipes its container, so the review chrome mounts in
  // its own host beside the plan (all its UI is fixed-position anyway).
  main = document.createElement('div')
  main.className = 'vp-main'
  main.innerHTML = '<h2>Design</h2>'
  document.body.appendChild(main)
  stubRect(main, 0, 200)
  const heading = main.querySelector('h2')
  if (heading) stubRect(heading, 10, 30)
  overlayHost = document.createElement('div')
  document.body.appendChild(overlayHost)
  fetchMock = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  act(() => root?.unmount())
  main.remove()
  overlayHost.remove()
  ;(globalThis as ReviewGlobal).__VP_REVIEW__ = undefined
  ;(globalThis as ReviewGlobal).__VP_REVIEW_PLAN_ID__ = undefined
  vi.restoreAllMocks()
})

function mount(): void {
  root = createRoot(overlayHost)
  act(() => root.render(<ReviewLayer />))
}

/** Find a rendered button by its visible label or aria-label. */
function findButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find(
    b => b.textContent?.trim() === label || b.getAttribute('aria-label') === label,
  )
  if (!button) throw new Error(`${label} button not found`)
  return button as HTMLButtonElement
}

/** Open the comment composer on the stubbed "Design" section via the hover add button. */
function openComposer(): void {
  act(() => {
    document.dispatchEvent(new MouseEvent('pointermove', { clientY: 50 }))
  })
  act(() => {
    findButton('Comment on "Design"').click()
  })
}

/** Type into the composer textarea through React's controlled-input machinery. */
function typeComment(text: string): void {
  const textarea = document.querySelector<HTMLTextAreaElement>('.vp-review-composer__input')
  if (!textarea) throw new Error('composer textarea not found')
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  act(() => {
    setter?.call(textarea, text)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Add one section comment on "Design" through the composer. */
function addComment(text: string): void {
  openComposer()
  typeComment(text)
  act(() => {
    findButton('Add comment').click()
  })
}

async function clickDecision(label: string): Promise<void> {
  await act(async () => {
    findButton(label).click()
  })
}

/** The JSON body of the POST to /__vp_feedback. */
function feedbackBody(): { comments: Array<Record<string, unknown>> } {
  const call = fetchMock.mock.calls.find(c => String(c[0]) === '/__vp_feedback')
  if (!call) throw new Error('no feedback POST was made')
  return JSON.parse((call[1] as RequestInit).body as string)
}

describe('read-only comment marks after a decision', () => {
  it('keeps the section comment badge visible and read-only after approving (golden)', async () => {
    mount()
    addComment('tighten this section')
    expect(document.querySelector('.vp-review-badge')).not.toBeNull()
    await clickDecision('Approve')
    // The mark survives the decision so the reviewer can still see what they flagged.
    const badge = document.querySelector<HTMLButtonElement>('.vp-review-badge')
    expect(badge).not.toBeNull()
    // Its popover still opens, but without the delete affordance.
    act(() => badge?.click())
    expect(document.querySelector('.vp-review-popover')).not.toBeNull()
    expect(document.querySelector('.vp-review-popover__delete')).toBeNull()
    // The live review controls are gone; only the submitted notice remains.
    expect(document.querySelector('.vp-review-bar')).toBeNull()
    expect(document.querySelector('.vp-review-composer')).toBeNull()
    expect(document.body.textContent).toContain('Approved')
  })

  it('closes an open composer when the decision lands (edge)', async () => {
    mount()
    addComment('tighten this section')
    openComposer()
    expect(document.querySelector('.vp-review-composer')).not.toBeNull()
    await clickDecision('Approve')
    expect(document.querySelector('.vp-review-composer')).toBeNull()
  })

  it('still shows the delete affordance before any decision (error guard)', () => {
    mount()
    addComment('tighten this section')
    act(() => findButton('1 comment on "Design"').click())
    expect(document.querySelector('.vp-review-popover__delete')).not.toBeNull()
  })

  it('keeps a selection quote mark rendered after the decision (golden)', async () => {
    // jsdom Ranges report no boxes; stub them so the selection button and quote mark can position.
    const rect = { top: 40, bottom: 55, left: 30, right: 90, width: 60, height: 15, x: 30, y: 40 }
    Range.prototype.getBoundingClientRect = () => rect as DOMRect
    Range.prototype.getClientRects = () => [rect] as unknown as DOMRectList
    mount()
    const textNode = main.querySelector('h2')?.firstChild
    if (!textNode) throw new Error('heading text missing')
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, 6)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup'))
    })
    act(() => findButton('Comment').click())
    typeComment('rename this')
    act(() => findButton('Add comment').click())
    expect(document.querySelector('.vp-review-quote-mark')).not.toBeNull()
    await clickDecision('Approve')
    expect(document.querySelector('.vp-review-quote-mark')).not.toBeNull()
  })
})

describe('comment severity', () => {
  it('sends severity must-fix when Must fix is selected in the composer (golden)', async () => {
    mount()
    openComposer()
    typeComment('this must change')
    const mustFix = findButton('Must fix')
    act(() => mustFix.click())
    expect(mustFix.getAttribute('aria-pressed')).toBe('true')
    act(() => findButton('Add comment').click())
    await clickDecision('Approve')
    expect(feedbackBody().comments[0]).toEqual({
      section: 'Design',
      body: 'this must change',
      severity: 'must-fix',
    })
  })

  it('sends an untagged comment without a severity key (edge)', async () => {
    mount()
    addComment('just a thought')
    await clickDecision('Approve')
    const comment = feedbackBody().comments[0]
    expect(comment).toBeDefined()
    expect(comment && 'severity' in comment).toBe(false)
  })

  it('deselects back to untagged when the chosen option is clicked again (edge)', async () => {
    mount()
    openComposer()
    typeComment('changed my mind on the tag')
    const suggestion = findButton('Suggestion')
    act(() => suggestion.click())
    act(() => suggestion.click())
    expect(suggestion.getAttribute('aria-pressed')).toBe('false')
    act(() => findButton('Add comment').click())
    await clickDecision('Approve')
    const comment = feedbackBody().comments[0]
    expect(comment && 'severity' in comment).toBe(false)
  })

  it('shows the severity tag in the comment popover listing (golden)', () => {
    mount()
    openComposer()
    typeComment('this must change')
    act(() => findButton('Must fix').click())
    act(() => findButton('Add comment').click())
    act(() => findButton('1 comment on "Design"').click())
    const tag = document.querySelector('.vp-review-tag')
    expect(tag?.textContent).toBe('must fix')
  })
})
