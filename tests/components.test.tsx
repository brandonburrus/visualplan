import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Callout } from '../runtime/components/Callout.js'
import { Compare } from '../runtime/components/Compare.js'
import { FileTree } from '../runtime/components/FileTree.js'
import { Phase } from '../runtime/components/Phase.js'
import { chartSchema } from '../runtime/shared/catalog.js'

describe('Phase', () => {
  it('renders the title and status badge (golden)', () => {
    const html = renderToStaticMarkup(<Phase title='Build the API' status='active' />)
    expect(html).toContain('Build the API')
    expect(html).toContain('data-status="active"')
  })

  it('throws on an invalid status (error)', () => {
    expect(() => renderToStaticMarkup(<Phase title='x' status='nope' />)).toThrow(/invalid props/)
  })

  it('defaults status to planned when omitted (edge)', () => {
    const html = renderToStaticMarkup(<Phase title='x' />)
    expect(html).toContain('data-status="planned"')
  })
})

describe('Callout', () => {
  it('renders the typed label (golden)', () => {
    const html = renderToStaticMarkup(<Callout type='risk'>danger</Callout>)
    expect(html).toContain('data-type="risk"')
    expect(html).toContain('Risk')
  })

  it('throws on an unknown type (error)', () => {
    expect(() => renderToStaticMarkup(<Callout type='bogus'>x</Callout>)).toThrow(/invalid props/)
  })

  it('defaults to a note when type is omitted (edge)', () => {
    const html = renderToStaticMarkup(<Callout>info</Callout>)
    expect(html).toContain('data-type="note"')
  })
})

describe('FileTree', () => {
  it('renders a marker per file (golden)', () => {
    const html = renderToStaticMarkup(
      <FileTree
        files={[
          { path: 'src/a.ts', change: 'add' },
          { path: 'src/b.ts', change: 'delete' },
        ]}
      />,
    )
    expect(html).toContain('src/a.ts')
    expect(html).toContain('data-change="add"')
    expect(html).toContain('data-change="delete"')
  })

  it('throws on an empty file list (error)', () => {
    expect(() => renderToStaticMarkup(<FileTree files={[]} />)).toThrow(/at least one entry/)
  })

  it('throws on an invalid change kind (edge)', () => {
    expect(() =>
      renderToStaticMarkup(<FileTree files={[{ path: 'x', change: 'rename' }]} />),
    ).toThrow(/invalid props/)
  })
})

describe('Compare', () => {
  it('renders option cards and marks the pick (golden)', () => {
    const html = renderToStaticMarkup(
      <Compare
        options={[
          { name: 'Redis', pros: ['accurate'], cons: ['hop'], pick: true },
          { name: 'Memory', pros: ['fast'], cons: ['per-node'] },
        ]}
      />,
    )
    expect(html).toContain('Redis')
    expect(html).toContain('Memory')
    expect(html).toContain('data-pick="true"')
  })

  it('throws when given fewer than two options (error)', () => {
    expect(() => renderToStaticMarkup(<Compare options={[{ name: 'only' }]} />)).toThrow(
      /at least two options/,
    )
  })

  it('renders an option with no pros or cons (edge)', () => {
    const html = renderToStaticMarkup(<Compare options={[{ name: 'A' }, { name: 'B' }]} />)
    expect(html).toContain('A')
    expect(html).toContain('B')
  })
})

describe('Chart schema', () => {
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
