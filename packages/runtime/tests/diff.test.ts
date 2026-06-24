import { afterEach, describe, expect, it } from 'vitest'
import {
  applyInlineWordDiff,
  diffOverlays,
  type InjectedDiff,
  isChanged,
  readDiff,
  wordDiffOps,
} from '../components/review/diff.js'
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

describe('wordDiffOps', () => {
  const compact = (ops: { type: string; text: string }[]) =>
    ops.map(o => (o.type === 'eq' ? o.text : `${o.type === 'del' ? '-' : '+'}${o.text}`))

  it('marks kept, inserted, and deleted words in order (golden)', () => {
    const ops = wordDiffOps('the old slow path'.split(' '), 'the new path'.split(' '))
    expect(compact(ops)).toEqual(['the', '-old', '-slow', '+new', 'path'])
  })

  it('reports an append as all insertions after the kept words (edge)', () => {
    const ops = wordDiffOps(
      'Roll out the flag'.split(' '),
      'Roll out the flag behind a guard'.split(' '),
    )
    expect(compact(ops)).toEqual(['Roll', 'out', 'the', 'flag', '+behind', '+a', '+guard'])
  })

  it('treats a capitalization-only change as unchanged (edge)', () => {
    expect(wordDiffOps('done'.split(' '), 'Done'.split(' ')).every(o => o.type === 'eq')).toBe(true)
  })

  it('does not mark a punctuation-only change, only the real insertion (edge)', () => {
    // "scaling." -> "scaling" is just a comma move; only "and" is genuinely inserted.
    const ops = wordDiffOps('scaling. We move'.split(' '), 'scaling and we move'.split(' '))
    expect(compact(ops)).toEqual(['scaling', '+and', 'we', 'move'])
  })
})

describe('applyInlineWordDiff', () => {
  it('re-renders an edited paragraph as a del/ins diff and restores it (golden + restore)', () => {
    document.body.innerHTML =
      '<div class="vp-phase"><div class="vp-phase__title">Build</div><p>Wrap the SDK</p></div>'
    const el = document.querySelector('.vp-phase') as Element
    const p = el.querySelector('p') as HTMLElement
    const original = p.innerHTML

    const restore = applyInlineWordDiff([el], 'Wrap the old SDK')
    expect(p.querySelector('del.vp-diff-del')?.textContent).toBe('old')
    expect(p.textContent).toContain('Wrap the')

    restore()
    expect(p.innerHTML).toBe(original)
  })

  it('does not touch a section whose prose is unchanged (edge)', () => {
    document.body.innerHTML = '<div class="vp-phase"><p>Stand up the client</p></div>'
    const el = document.querySelector('.vp-phase') as Element
    const original = (el.querySelector('p') as HTMLElement).innerHTML
    applyInlineWordDiff([el], 'Stand up the client')
    expect((el.querySelector('p') as HTMLElement).innerHTML).toBe(original)
  })

  it('ignores data-component prose, only diffing real paragraphs (edge)', () => {
    document.body.innerHTML =
      '<div class="vp-phase"><p>Wrap the SDK</p><div class="vp-filetree"><p>add backfill.ts</p></div></div>'
    const el = document.querySelector('.vp-phase') as Element
    applyInlineWordDiff([el], 'Wrap the SDK')
    // The filetree paragraph is left alone (no diff markup injected there).
    const filetreeP = el.querySelector('.vp-filetree p') as HTMLElement
    expect(filetreeP.querySelector('del, ins')).toBeNull()
    expect(filetreeP.textContent).toBe('add backfill.ts')
  })
})
