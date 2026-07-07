import { describe, expect, it } from 'vitest'
import {
  CATALOG,
  chartSchema,
  matrixSchema,
  questionItemSchema,
  questionsSchema,
  statSchema,
} from '../src/index.js'

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

describe('questionItemSchema', () => {
  it('accepts a question with multiple-choice options (golden)', () => {
    const result = questionItemSchema.safeParse({
      text: 'Rotate refresh tokens?',
      options: ['Yes, every use', 'Only after 24h'],
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.options).toEqual(['Yes, every use', 'Only after 24h'])
  })

  it('rejects an empty option string (error)', () => {
    const result = questionItemSchema.safeParse({ text: 'Rotate?', options: [''] })
    expect(result.success).toBe(false)
  })

  it('defaults options to an empty array (edge)', () => {
    const result = questionItemSchema.safeParse({ text: 'Rotate?' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.options).toEqual([])
  })

  it('rejects empty question text (error)', () => {
    const result = questionItemSchema.safeParse({ text: '', options: [] })
    expect(result.success).toBe(false)
  })
})

describe('questionsSchema', () => {
  it('accepts object items alongside plain strings, normalizing both (golden)', () => {
    const result = questionsSchema.safeParse({
      items: ['Free text only?', { text: 'Rotate?', options: ['Yes', 'No'] }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.items).toEqual([
        { text: 'Free text only?', options: [] },
        { text: 'Rotate?', options: ['Yes', 'No'] },
      ])
    }
  })

  it('rejects an empty string question (error)', () => {
    expect(questionsSchema.safeParse({ items: [''] }).success).toBe(false)
  })

  it('rejects an empty item list (edge)', () => {
    expect(questionsSchema.safeParse({ items: [] }).success).toBe(false)
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
