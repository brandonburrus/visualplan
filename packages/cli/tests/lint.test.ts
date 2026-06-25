import { describe, expect, it } from 'vitest'
import { lintSource } from '../src/build/lint.js'

/** The lint emits only warnings; every fixture that fires should produce warn-severity issues. */
function warnings(source: string): string[] {
  const issues = lintSource(source)
  expect(issues.every(issue => issue.severity === 'warn')).toBe(true)
  return issues.map(issue => issue.message)
}

describe('lintSource', () => {
  describe('wall-of-prose', () => {
    it('flags a Phase that is a long run of prose with no structure', () => {
      const source = `# Plan\n\n<Phase title="Context">\n\n${'context detail '.repeat(50)}\n\n</Phase>\n`
      expect(warnings(source).some(m => m.includes('characters of prose'))).toBe(true)
    })

    it('passes a Phase that leads with a list', () => {
      const source = `# Plan\n\n<Phase title="Step">\n\n1. do a thing\n2. do another thing\n\n</Phase>\n`
      expect(lintSource(source)).toEqual([])
    })
  })

  describe('all-prose plan', () => {
    it('flags a plan with no diagram or component', () => {
      const source =
        '# Plan\n\nThis plan is written entirely as prose, with no structure to show at all.\n'
      expect(warnings(source).some(m => m.includes('all prose'))).toBe(true)
    })

    it('passes a plan with a data component', () => {
      const source = '# Plan\n\n<Checklist title="Done when">\n- [ ] ship it\n</Checklist>\n'
      expect(lintSource(source)).toEqual([])
    })
  })

  describe('wide mermaid', () => {
    it('flags a left-to-right flowchart past the edge budget', () => {
      const diagram =
        'flowchart LR\n  A --> B\n  B --> C\n  C --> D\n  D --> E\n  E --> F\n  F --> G\n  G --> H'
      const source = `# Plan\n\n\`\`\`mermaid\n${diagram}\n\`\`\`\n`
      expect(warnings(source).some(m => m.includes('left-to-right flowchart'))).toBe(true)
    })

    it('passes the same node count as a top-down flowchart', () => {
      const diagram =
        'flowchart TD\n  A --> B\n  B --> C\n  C --> D\n  D --> E\n  E --> F\n  F --> G\n  G --> H'
      const source = `# Plan\n\n\`\`\`mermaid\n${diagram}\n\`\`\`\n`
      expect(lintSource(source)).toEqual([])
    })
  })

  describe('long Matrix cell', () => {
    it('flags a cell that overflows the budget', () => {
      const source =
        '# Plan\n\n<Matrix>\n| Dimension | Option A | Option B |\n|---|---|---|\n| Latency under sustained production load | low | high |\n</Matrix>\n'
      expect(warnings(source).some(m => m.includes('Matrix cell is too long'))).toBe(true)
    })

    it('passes a matrix of short cells', () => {
      const source =
        '# Plan\n\n<Matrix>\n| Dim | A | B |\n|---|---|---|\n| Speed | low | high |\n</Matrix>\n'
      expect(lintSource(source)).toEqual([])
    })
  })

  describe('commented move row', () => {
    it('flags a FileTree move row that carries a -- comment', () => {
      const source =
        '# Plan\n\n<FileTree>\n- move src/old.ts -> src/new.ts -- renamed for clarity\n</FileTree>\n'
      expect(warnings(source).some(m => m.includes('move row carries'))).toBe(true)
    })

    it('passes a move row with no comment', () => {
      const source =
        '# Plan\n\n<FileTree>\n- add src/new.ts\n- move src/old.ts -> src/moved.ts\n</FileTree>\n'
      expect(lintSource(source)).toEqual([])
    })
  })

  describe('chart magnitude spread', () => {
    it('flags a multi-series chart whose series differ wildly in scale', () => {
      const source =
        '# Plan\n\n<Chart type="bar" title="x">\n| Cat | Small | Huge |\n|---|---|---|\n| A | 5 | 100000 |\n</Chart>\n'
      expect(warnings(source).some(m => m.includes('differ wildly in scale'))).toBe(true)
    })

    it('passes a ramp where one series grows along the category axis', () => {
      // The series are comparable at each step; the spread is along x (the ramp), not across series.
      const source =
        '# Plan\n\n<Chart type="area" title="x" stacked>\n| Step | Allowed | Rejected |\n|---|---|---|\n| 1% | 50 | 2 |\n| 10% | 480 | 15 |\n| 100% | 4800 | 120 |\n</Chart>\n'
      expect(lintSource(source)).toEqual([])
    })

    it('passes a single series spread across its categories', () => {
      const source = '# Plan\n\n<Chart type="bar" title="x">\n- Small: 1\n- Large: 5000\n</Chart>\n'
      expect(lintSource(source)).toEqual([])
    })
  })
})
