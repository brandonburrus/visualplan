import { afterEach, describe, expect, it } from 'vitest'
import { collectSections, sectionContent } from '../components/review/SectionComments.js'

afterEach(() => {
  document.body.innerHTML = ''
})

/** Build a `.vp-main` from a list of child element HTML strings, as the rendered plan would have. */
function setMain(...children: string[]): void {
  document.body.innerHTML = `<main class="vp-main">${children.join('')}</main>`
}

/** jsdom does no layout, so stub the box an element reports for the content-rect math. */
function stubRect(el: Element, top: number, bottom: number): void {
  el.getBoundingClientRect = () =>
    ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top }) as DOMRect
}

describe('collectSections', () => {
  it('splits loose top-level blocks into their own sections instead of one giant intro (golden)', () => {
    // The exact case from the review note: a title, intro prose, a diagram, and a callout all
    // before the first phase must not collapse into a single oversized section.
    setMain(
      '<h1>Plan</h1>',
      '<p>intro prose</p>',
      '<div class="vp-mermaid"><svg></svg></div>',
      '<aside class="vp-callout"><div class="vp-callout__label">Decision</div></aside>',
      '<div class="vp-phase"><div class="vp-phase__title">Build it</div></div>',
    )
    const sections = collectSections()
    // h1, diagram, callout, phase each start a section (the bare <p> joins the heading above it).
    expect(sections.map(s => s.label)).toEqual(['Plan', 'Diagram', 'Decision', 'Build it'])
  })

  it('keeps a block nested inside a phase part of that phase, not its own section (edge)', () => {
    setMain(
      '<div class="vp-phase"><div class="vp-phase__title">Build</div><div class="vp-mermaid"></div></div>',
    )
    const sections = collectSections()
    expect(sections).toHaveLength(1)
    expect(sections[0]?.label).toBe('Build')
  })

  it('returns no sections when there is no plan column (error)', () => {
    document.body.innerHTML = '<div>no main here</div>'
    expect(collectSections()).toEqual([])
  })

  // PARITY GOLDEN: the same ordered section sequence is asserted against the mdast-based
  // `splitSections` in packages/compile/tests/sections.test.ts ("full section-start vocabulary").
  // The diff maps a status onto a DOM section by document-order index, so the DOM split here and the
  // mdast split there MUST stay aligned. Add/remove a section component -> update BOTH goldens.
  it('detects the full section-start vocabulary in order, matching splitSections (parity golden)', () => {
    setMain(
      '<h1>Title</h1>',
      '<h2>Section two</h2>',
      '<h3>Section three</h3>',
      '<div class="vp-mermaid"><svg></svg></div>',
      '<div class="vp-phase"><div class="vp-phase__title">Build</div></div>',
      '<aside class="vp-callout"><div class="vp-callout__label">Risk</div></aside>',
      '<div class="vp-filetree"></div>',
      '<div class="vp-chart"><div class="vp-chart__title">Effort</div></div>',
      '<div class="vp-matrix-wrap"><table class="vp-matrix"></table></div>',
      '<div class="vp-compare"></div>',
      '<div class="vp-checklist"><div class="vp-checklist__title">Done when</div></div>',
      '<div class="vp-stat"></div>',
      '<div class="vp-questions"><div class="vp-questions__title">Open questions</div></div>',
    )
    expect(collectSections().map(s => tokenForElement(s.element))).toEqual([
      'h1',
      'h2',
      'h3',
      'mermaid',
      'phase',
      'callout',
      'filetree',
      'chart',
      'matrix',
      'compare',
      'checklist',
      'stat',
      'questions',
    ])
  })
})

describe('sectionContent', () => {
  it('trims a phase last-element bottom padding so the band hugs content, not the gap (golden)', () => {
    setMain(
      '<div class="vp-phase" style="padding-bottom: 30px"><div class="vp-phase__title">Build</div></div>',
    )
    const [section] = collectSections()
    if (!section) throw new Error('expected a section')
    // Single phase: element === lastElement; its 130px-tall box ends 30px past the real content.
    stubRect(section.element, 100, 230)
    expect(sectionContent(section)).toEqual({ top: 100, bottom: 200 })
  })

  it('leaves a section whose last element has no bottom padding unchanged (edge)', () => {
    setMain('<h2>Heading</h2>', '<p>body</p>')
    const [section] = collectSections()
    if (!section) throw new Error('expected a section')
    stubRect(section.element, 10, 20)
    stubRect(section.lastElement, 25, 60)
    expect(sectionContent(section).bottom).toBe(60)
  })

  it('does NOT trim a card section: its bottom padding is inner inset, not a structural gap (edge)', () => {
    // A callout's padding-bottom is the card's own content inset; trimming it would pull the band up
    // across the card and clip it, so the band must reach the card's full box bottom.
    setMain(
      '<aside class="vp-callout" style="padding-bottom: 24px"><div class="vp-callout__label">Note</div></aside>',
    )
    const [section] = collectSections()
    if (!section) throw new Error('expected a section')
    stubRect(section.element, 50, 174)
    expect(sectionContent(section).bottom).toBe(174)
  })
})

/** The section type token for a DOM element, mirroring splitSections' tokens, so the two parity
 * goldens compare the same vocabulary. */
function tokenForElement(el: Element): string {
  if (/^H[1-3]$/.test(el.tagName)) return el.tagName.toLowerCase()
  const byClass: ReadonlyArray<[string, string]> = [
    ['vp-mermaid', 'mermaid'],
    ['vp-phase', 'phase'],
    ['vp-callout', 'callout'],
    ['vp-filetree', 'filetree'],
    ['vp-chart', 'chart'],
    ['vp-matrix-wrap', 'matrix'],
    ['vp-compare', 'compare'],
    ['vp-checklist', 'checklist'],
    ['vp-stat', 'stat'],
    ['vp-questions', 'questions'],
  ]
  for (const [cls, token] of byClass) if (el.classList.contains(cls)) return token
  return 'unknown'
}
