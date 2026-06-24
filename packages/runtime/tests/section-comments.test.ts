import { afterEach, describe, expect, it } from 'vitest'
import { collectSections } from '../components/review/SectionComments.js'

afterEach(() => {
  document.body.innerHTML = ''
})

/** Build a `.vp-main` from a list of child element HTML strings, as the rendered plan would have. */
function setMain(...children: string[]): void {
  document.body.innerHTML = `<main class="vp-main">${children.join('')}</main>`
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
})
