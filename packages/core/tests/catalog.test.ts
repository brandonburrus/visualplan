import { describe, expect, it } from 'vitest'
import { CATALOG, chartSchema, matrixSchema, statSchema } from '../src/index.js'

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

  it('accepts each new chart type (golden)', () => {
    for (const type of ['scatter', 'radar', 'gauge', 'funnel', 'treemap']) {
      const result = chartSchema.safeParse({
        type,
        series: ['value'],
        data: [{ label: 'x', values: [1] }],
      })
      expect(result.success).toBe(true)
    }
  })

  it('accepts the stacked attribute and keeps it on the parsed object (golden)', () => {
    const result = chartSchema.safeParse({
      type: 'bar',
      stacked: true,
      series: ['a', 'b'],
      data: [{ label: 'x', values: [1, 2] }],
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.stacked).toBe(true)
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

describe('statSchema', () => {
  it('accepts an item with an intent and caption (golden)', () => {
    const result = statSchema.safeParse({
      title: 'Impact',
      items: [{ label: 'Est. uptime', value: '99.9%', intent: 'good', caption: 'rolling avg' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty items (error)', () => {
    const result = statSchema.safeParse({ items: [] })
    expect(result.success).toBe(false)
  })

  it('rejects an item missing its value (edge)', () => {
    const result = statSchema.safeParse({ items: [{ label: 'Files changed' }] })
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
