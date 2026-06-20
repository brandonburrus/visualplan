import { describe, expect, it } from 'vitest'
import { CATALOG, chartSchema } from '../src/index.js'

describe('chartSchema', () => {
  it('accepts a valid bar spec (golden)', () => {
    const result = chartSchema.safeParse({ type: 'bar', data: [{ label: 'x', value: 1 }] })
    expect(result.success).toBe(true)
  })

  it('rejects an unknown chart type (error)', () => {
    const result = chartSchema.safeParse({ type: 'donut', data: [{ label: 'x', value: 1 }] })
    expect(result.success).toBe(false)
  })

  it('rejects empty data (edge)', () => {
    const result = chartSchema.safeParse({ type: 'pie', data: [] })
    expect(result.success).toBe(false)
  })
})

describe('CATALOG', () => {
  it('lists every component with a name, summary, and example (golden)', () => {
    expect(CATALOG.length).toBeGreaterThan(0)
    for (const entry of CATALOG) {
      expect(entry.name).toBeTruthy()
      expect(entry.summary).toBeTruthy()
      expect(entry.example).toBeTruthy()
    }
  })

  it('exposes static enums for the components that constrain string props (edge)', () => {
    const phase = CATALOG.find(entry => entry.name === 'Phase')
    expect(phase?.staticEnums.status).toEqual(['planned', 'active', 'done'])
  })
})
