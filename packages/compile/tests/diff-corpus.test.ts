import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { diffSections } from '../src/sections.js'

/**
 * A subagent-generated corpus of realistic plan-iteration edits (see the approved plan's "subagent
 * simulations"), each with a human-intent expected classification. It validates `diffSections` and
 * calibrates the rename threshold. Cases are tagged `core` (unambiguous: a strict assertion) or
 * `stretch` (threshold-boundary: a reworded rename near the similarity cutoff, or a reorder of
 * identically-titled sections — where add+remove vs edited is acceptable, so we assert only the
 * safety property that the change is surfaced at all, never silently dropped).
 */
interface DiffCase {
  name: string
  category: string
  baseline: string
  current: string
  expectedStatuses: ('unchanged' | 'edited' | 'added')[]
  expectedRemovedTypes: string[]
  confidence: 'core' | 'stretch'
}

const corpusPath = fileURLToPath(new URL('./fixtures/diff-corpus.json', import.meta.url))
const corpus: DiffCase[] = JSON.parse(readFileSync(corpusPath, 'utf8'))

const core = corpus.filter(c => c.confidence === 'core')
const stretch = corpus.filter(c => c.confidence === 'stretch')

describe('diffSections corpus (core: must match the intended classification)', () => {
  it.each(core.map(c => [c.name, c] as const))('%s', (_name, testCase) => {
    const diff = diffSections(testCase.baseline, testCase.current)
    expect(diff.sections.map(s => s.status)).toEqual(testCase.expectedStatuses)
    expect(diff.removed.map(r => r.type)).toEqual(testCase.expectedRemovedTypes)
  })
})

describe('diffSections corpus (stretch: boundary cases must still surface the change)', () => {
  it.each(stretch.map(c => [c.name, c] as const))('%s', (_name, testCase) => {
    const diff = diffSections(testCase.baseline, testCase.current)
    // The mapping must stay sound: one status per current section, in order.
    expect(diff.sections).toHaveLength(testCase.current ? countCurrentSections(testCase) : 0)
    // A boundary case may classify a rename as edited OR as add+remove, but it must never silently
    // report the edited plan as fully unchanged: the reviewer would miss a real change.
    const surfaced =
      diff.sections.filter(s => s.status !== 'unchanged').length + diff.removed.length
    expect(surfaced).toBeGreaterThan(0)
  })
})

/** The expected current-section count for a case, taken from its oracle (its length is verified
 * correct by construction in the fixture). */
function countCurrentSections(testCase: DiffCase): number {
  return testCase.expectedStatuses.length
}
