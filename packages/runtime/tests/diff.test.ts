import { afterEach, describe, expect, it } from 'vitest'
import { diffOverlays, type InjectedDiff, isChanged, readDiff } from '../components/review/diff.js'
import { collectSections } from '../components/review/SectionComments.js'

afterEach(() => {
  document.body.innerHTML = ''
  ;(globalThis as { __VP_DIFF__?: InjectedDiff }).__VP_DIFF__ = undefined
})

/** Build a `.vp-main` from child element HTML, as the rendered plan would have. */
function setMain(...children: string[]): void {
  document.body.innerHTML = `<main class="vp-main">${children.join('')}</main>`
}

/** A four-section plan (h1, phase, callout, phase) matching the diff fixtures below. */
function fourSectionPlan(): void {
  setMain(
    '<h1>Plan</h1>',
    '<div class="vp-phase"><div class="vp-phase__title">One</div></div>',
    '<aside class="vp-callout"><div class="vp-callout__label">Risk</div></aside>',
    '<div class="vp-phase"><div class="vp-phase__title">Two</div></div>',
  )
}

const FOUR: InjectedDiff = {
  sections: [
    { status: 'unchanged', label: 'Plan', type: 'h1' },
    { status: 'edited', label: 'One', type: 'phase' },
    { status: 'unchanged', label: 'Risk', type: 'callout' },
    { status: 'added', label: 'Two', type: 'phase' },
  ],
  removed: [],
}

describe('diffOverlays', () => {
  it('emits a gutter bar only for changed sections, by document-order index (golden)', () => {
    fourSectionPlan()
    const overlays = diffOverlays(collectSections(), FOUR, false)
    expect(overlays.map(o => [o.kind, o.status, o.sectionIndex])).toEqual([
      ['bar', 'edited', 1],
      ['bar', 'added', 3],
    ])
  })

  it('adds a scrim over each unchanged section when only-changes is on (edge)', () => {
    fourSectionPlan()
    const overlays = diffOverlays(collectSections(), FOUR, true)
    expect(overlays.filter(o => o.kind === 'bar')).toHaveLength(2)
    const scrims = overlays.filter(o => o.kind === 'scrim')
    expect(scrims.map(o => o.sectionIndex)).toEqual([0, 2])
  })

  it('emits nothing when the DOM section count disagrees with the diff (error / parity guard)', () => {
    // Three DOM sections but a four-entry diff: index alignment is unsafe, so no cues at all.
    setMain('<h1>Plan</h1>', '<div class="vp-phase"><div class="vp-phase__title">One</div></div>')
    expect(diffOverlays(collectSections(), FOUR, false)).toEqual([])
  })
})

describe('readDiff', () => {
  it('returns null when no diff was injected, the payload when it was (golden + edge)', () => {
    expect(readDiff()).toBeNull()
    ;(globalThis as { __VP_DIFF__?: InjectedDiff }).__VP_DIFF__ = FOUR
    expect(readDiff()).toBe(FOUR)
  })
})

describe('isChanged', () => {
  it('treats added and edited as changes, unchanged as not (golden)', () => {
    expect(isChanged('added')).toBe(true)
    expect(isChanged('edited')).toBe(true)
    expect(isChanged('unchanged')).toBe(false)
  })
})
