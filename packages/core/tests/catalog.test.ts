import { describe, expect, it } from 'vitest'
import { CATALOG, chartSchema, matrixSchema } from '../src/index.js'

describe('chartSchema', () => {
  it('accepts a valid bar spec (golden)', () => {
    const result = chartSchema.safeParse({
      type: 'bar',
      series: ['value'],
      data: [{ label: 'x', values: [1] }],
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid area spec (golden)', () => {
    const result = chartSchema.safeParse({
      type: 'area',
      series: ['value'],
      data: [{ label: 'x', values: [1] }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects an unknown chart type (error)', () => {
    const result = chartSchema.safeParse({
      type: 'donut',
      series: ['value'],
      data: [{ label: 'x', values: [1] }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty data (edge)', () => {
    const result = chartSchema.safeParse({ type: 'pie', series: ['value'], data: [] })
    expect(result.success).toBe(false)
  })
})

describe('matrixSchema', () => {
  it('accepts a valid grid with a pick (golden)', () => {
    const result = matrixSchema.safeParse({
      corner: 'Dimension',
      columns: [{ name: 'A', pick: true }, { name: 'B' }],
      rows: [{ label: 'r1', cells: ['x', 'y'] }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects a grid with fewer than two columns (error)', () => {
    const result = matrixSchema.safeParse({
      columns: [{ name: 'A' }],
      rows: [{ label: 'r1', cells: ['x'] }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects a grid with no rows (edge)', () => {
    const result = matrixSchema.safeParse({ columns: [{ name: 'A' }, { name: 'B' }], rows: [] })
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
