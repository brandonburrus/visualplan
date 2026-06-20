import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Callout } from '../components/Callout.js'
import { Checklist } from '../components/Checklist.js'
import { Compare } from '../components/Compare.js'
import { FileTree } from '../components/FileTree.js'
import { Phase } from '../components/Phase.js'
import { Questions } from '../components/Questions.js'

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
  it('renders a nested tree: collapsed dirs, leaf names, and change markers (golden)', () => {
    const html = renderToStaticMarkup(
      <FileTree
        files={[
          { path: 'src/api/routes.ts', change: 'add' },
          { path: 'src/api/db.ts', change: 'modify' },
          { path: 'legacy.ts', change: 'delete' },
        ]}
      />,
    )
    // src/api is a single-child chain, so it collapses to one directory row.
    expect(html).toContain('src/api/')
    expect(html).toContain('routes.ts')
    expect(html).toContain('db.ts')
    expect(html).toContain('legacy.ts')
    expect(html).toContain('data-change="add"')
    expect(html).toContain('data-change="modify"')
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

describe('Questions', () => {
  it('renders each open question with a marker (golden)', () => {
    const html = renderToStaticMarkup(
      <Questions items={['Is 15 minutes the right TTL?', 'Should refresh tokens rotate?']} />,
    )
    expect(html).toContain('Open questions')
    expect(html).toContain('Is 15 minutes the right TTL?')
    expect(html).toContain('Should refresh tokens rotate?')
  })

  it('throws on an empty question list (error)', () => {
    expect(() => renderToStaticMarkup(<Questions items={[]} />)).toThrow(/at least one item/)
  })

  it('renders a single question (edge)', () => {
    const html = renderToStaticMarkup(<Questions items={['Only one?']} />)
    expect(html).toContain('Only one?')
  })
})

describe('Checklist', () => {
  it('renders done and todo items with a title (golden)', () => {
    const html = renderToStaticMarkup(
      <Checklist
        title='Done when'
        items={[{ text: 'Returns 429', done: true }, { text: 'Dashboards live' }]}
      />,
    )
    expect(html).toContain('Done when')
    expect(html).toContain('Returns 429')
    expect(html).toContain('Dashboards live')
    expect(html).toContain('data-done="true"')
    expect(html).toContain('data-done="false"')
  })

  it('throws on an empty item list (error)', () => {
    expect(() => renderToStaticMarkup(<Checklist items={[]} />)).toThrow(/at least one item/)
  })

  it('defaults an item to not done (edge)', () => {
    const html = renderToStaticMarkup(<Checklist items={[{ text: 'only' }]} />)
    expect(html).toContain('data-done="false"')
  })
})
