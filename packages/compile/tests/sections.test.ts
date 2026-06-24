import { describe, expect, it } from 'vitest'
import { diffSections, splitSections } from '../src/sections.js'

/** A small well-formed plan used as the unchanged baseline across the diff cases. */
const BASE = `# Rate limiting

Intro prose before the first phase.

<Phase title="Build the limiter">
Implement the Redis window.
</Phase>

<Callout type="risk">
A Redis outage must fail open.
</Callout>

<Phase title="Ship it">
Roll out behind a flag.
</Phase>
`

describe('splitSections', () => {
  it('enumerates the section-start blocks in document order', () => {
    const sections = splitSections(BASE)
    expect(sections.map(s => s.type)).toEqual(['h1', 'phase', 'callout', 'phase'])
    expect(sections.map(s => s.label)).toEqual([
      'Rate limiting',
      'Build the limiter',
      'Risk',
      'Ship it',
    ])
  })

  it('does not treat nested blocks or non-section blocks as starts', () => {
    const source = `# Title

<Phase title="Outer">
Some text.

<Callout type="note">
Nested callout, not a top-level section.
</Callout>
</Phase>

\`\`\`math
T(n) = O(n)
\`\`\`
`
    // h1 + the one top-level Phase only; the nested Callout and the math fence are not starts.
    expect(splitSections(source).map(s => s.type)).toEqual(['h1', 'phase'])
  })

  it('treats a mermaid fence as a section start but not a regular code fence', () => {
    const source = `# Title

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`

\`\`\`ts
const x = 1
\`\`\`
`
    expect(splitSections(source).map(s => s.type)).toEqual(['h1', 'mermaid'])
  })

  // PARITY GOLDEN: this exact ordered type sequence is also asserted against the runtime's DOM-based
  // `collectSections` in packages/runtime/tests/section-comments.test.ts ("full vocabulary parity").
  // The two must agree, because the runtime maps a diff status onto a DOM section by document-order
  // index. If you add or remove a section-starting component, update BOTH goldens together.
  it('covers the full section-start vocabulary in order (parity golden)', () => {
    const source = `# Title

## Section two

### Section three

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`

<Phase title="Build">
Do the thing.
</Phase>

<Callout type="risk">
Watch out.
</Callout>

<FileTree>
- add src/x.ts
</FileTree>

<Chart type="bar" title="Effort">
- A: 1
</Chart>

<Matrix>
| Dim | A | B |
|-----|---|---|
| x   | 1 | 2 |
</Matrix>

<Compare>
## Option A
- pro: fast
</Compare>

<Checklist title="Done when">
- [ ] works
</Checklist>

<Stat>
- Files: 3
</Stat>

<Questions>
- Is it ready?
</Questions>
`
    expect(splitSections(source).map(s => s.type)).toEqual([
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

  it('excludes data-component children from a section prose (so word-diff stays clean)', () => {
    const source = `# Title

<Phase title="Build">
Wrap the SDK.

<FileTree>
- add src/x.ts
</FileTree>
</Phase>
`
    const phase = splitSections(source)[1]
    // Prose carries the paragraph but not the FileTree entry text (which tokenizes unlike its source).
    expect(phase?.prose).toBe('Wrap the SDK.')
  })

  it('gives titled sections a label-based key and titleless ones a content-based key', () => {
    const sections = splitSections(BASE)
    const phase = sections[1]
    const callout = sections[2]
    expect(phase?.titled).toBe(true)
    expect(phase?.key).toBe('phase:Build the limiter')
    expect(callout?.titled).toBe(false)
    expect(callout?.key).toMatch(/^callout:#/)
  })
})

describe('diffSections', () => {
  it('reports every section unchanged when the source is identical', () => {
    const diff = diffSections(BASE, BASE)
    expect(diff.sections.map(s => s.status)).toEqual([
      'unchanged',
      'unchanged',
      'unchanged',
      'unchanged',
    ])
    expect(diff.removed).toEqual([])
  })

  it('marks an edited phase body as edited and leaves its siblings unchanged', () => {
    const current = BASE.replace(
      'Implement the Redis window.',
      'Implement the sliding window in Redis.',
    )
    const diff = diffSections(BASE, current)
    expect(diff.sections.map(s => s.status)).toEqual([
      'unchanged',
      'edited',
      'unchanged',
      'unchanged',
    ])
  })

  it('marks a newly inserted section as added and keeps the rest stable', () => {
    const current = BASE.replace(
      '<Phase title="Ship it">',
      '<Phase title="Test it">\nWrite the tests.\n</Phase>\n\n<Phase title="Ship it">',
    )
    const diff = diffSections(BASE, current)
    expect(diff.sections.map(s => s.status)).toEqual([
      'unchanged',
      'unchanged',
      'unchanged',
      'added',
      'unchanged',
    ])
  })

  it('reports a deleted section under removed, not in the current sections', () => {
    const current = BASE.replace(/<Callout type="risk">[\s\S]*?<\/Callout>\n\n/, '')
    const diff = diffSections(BASE, current)
    expect(diff.sections.map(s => s.status)).toEqual(['unchanged', 'unchanged', 'unchanged'])
    expect(diff.removed.map(r => r.type)).toEqual(['callout'])
  })

  it('carries the baseline prose as prev on an edited section, not on others', () => {
    const current = BASE.replace(
      'Implement the Redis window.',
      'Implement the sliding window in Redis.',
    )
    const diff = diffSections(BASE, current)
    const [title, phase, callout] = diff.sections
    expect(phase?.status).toBe('edited')
    expect(phase?.prev).toBe('Implement the Redis window.')
    // Unchanged sections (and added ones) carry no prev.
    expect(title?.prev).toBeUndefined()
    expect(callout?.prev).toBeUndefined()
  })

  it('detects a reworded title as an edit (rename), not a remove + add', () => {
    const current = BASE.replace('title="Build the limiter"', 'title="Build the rate limiter"')
    const diff = diffSections(BASE, current)
    expect(diff.sections.map(s => s.status)).toEqual([
      'unchanged',
      'edited',
      'unchanged',
      'unchanged',
    ])
    expect(diff.removed).toEqual([])
  })
})
