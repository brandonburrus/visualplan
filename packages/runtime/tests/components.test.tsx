import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Callout } from '../components/Callout.js'
import { Chart } from '../components/Chart.js'
import { Checklist } from '../components/Checklist.js'
import { Compare } from '../components/Compare.js'
import { FileTree } from '../components/FileTree.js'
import { MathBlock } from '../components/Math.js'
import { Matrix } from '../components/Matrix.js'
import { Phase } from '../components/Phase.js'
import { Questions } from '../components/Questions.js'
import { ReviewAnswersProvider } from '../components/review/ReviewAnswers.js'
import { ReviewLayer } from '../components/review/ReviewLayer.js'
import { copyText, ShareButton } from '../components/ShareButton.js'
import { Stat } from '../components/Stat.js'
import { ThemeToggle } from '../components/ThemeToggle.js'
import { Layout } from '../Layout.js'

describe('Phase', () => {
  it('renders the title and a status badge for active/done (golden)', () => {
    const html = renderToStaticMarkup(<Phase title='Build the API' status='active' />)
    expect(html).toContain('Build the API')
    expect(html).toContain('data-status="active"')
    expect(html).toContain('vp-phase__badge')
  })

  it('throws on an invalid status (error)', () => {
    expect(() => renderToStaticMarkup(<Phase title='x' status='nope' />)).toThrow(/invalid props/)
  })

  it('defaults to planned and renders no badge for the planned state (edge)', () => {
    const html = renderToStaticMarkup(<Phase title='x' />)
    expect(html).toContain('data-status="planned"')
    expect(html).not.toContain('vp-phase__badge')
  })
})

describe('MathBlock', () => {
  it('injects the pre-rendered MathML markup (golden)', () => {
    const html = renderToStaticMarkup(<MathBlock html='<math><mn>1</mn></math>' />)
    expect(html).toContain('vp-math')
    expect(html).toContain('<math>')
    expect(html).toContain('<mn>1</mn>')
  })

  it('renders an empty container when given no markup (edge)', () => {
    const html = renderToStaticMarkup(<MathBlock html='' />)
    expect(html).toContain('vp-math')
  })
})

describe('Callout', () => {
  it('renders the typed label (golden)', () => {
    const html = renderToStaticMarkup(<Callout type='risk'>danger</Callout>)
    expect(html).toContain('data-type="risk"')
    expect(html).toContain('Risk')
  })

  it('renders a tip with its own label (golden)', () => {
    const html = renderToStaticMarkup(<Callout type='tip'>advice</Callout>)
    expect(html).toContain('data-type="tip"')
    expect(html).toContain('Tip')
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

  it('renders a trailing-slash path as a directory row with a change marker (edge)', () => {
    const html = renderToStaticMarkup(
      <FileTree files={[{ path: 'src/legacy/', change: 'delete' }]} />,
    )
    expect(html).toContain('vp-filetree__row--dir')
    expect(html).toContain('src/legacy/')
    expect(html).toContain('data-change="delete"')
  })

  it('renders a move at its destination, showing the origin path (golden)', () => {
    const html = renderToStaticMarkup(
      <FileTree
        files={[{ path: 'src/billing/invoice.ts', change: 'move', from: 'src/billing.ts' }]}
      />,
    )
    // The file lives at its destination, with the origin shown as a "moved from" annotation.
    expect(html).toContain('invoice.ts')
    expect(html).toContain('vp-filetree__from')
    expect(html).toContain('src/billing.ts')
    expect(html).toContain('data-change="move"')
  })

  it('renders an inline comment on a file row (golden)', () => {
    const html = renderToStaticMarkup(
      <FileTree files={[{ path: 'src/a.ts', change: 'modify', comment: 'add a retry loop' }]} />,
    )
    expect(html).toContain('vp-filetree__comment')
    expect(html).toContain('add a retry loop')
  })

  it('injects a build-time icon SVG when present (edge)', () => {
    const html = renderToStaticMarkup(
      <FileTree files={[{ path: 'src/a.ts', change: 'add', icon: '<svg id="ts-icon"></svg>' }]} />,
    )
    expect(html).toContain('vp-filetree__icon')
    expect(html).toContain('<svg id="ts-icon">')
    // With an icon present the generic fallback glyph is not rendered.
    expect(html).not.toContain('vp-filetree__icon-fallback')
  })

  it('falls back to a generic icon when no icon is resolved (edge)', () => {
    const html = renderToStaticMarkup(<FileTree files={[{ path: 'src/a.ts', change: 'add' }]} />)
    expect(html).toContain('vp-filetree__icon-fallback')
  })
})

describe('Matrix', () => {
  const grid = {
    corner: 'Dimension',
    columns: [{ name: 'Postgres', pick: true }, { name: 'DynamoDB' }],
    rows: [
      { label: 'Writes', cells: ['medium', 'high'] },
      { label: 'Cost', cells: ['low', 'low'] },
    ],
  }

  it('renders the grid and highlights the pick column (golden)', () => {
    const html = renderToStaticMarkup(<Matrix data={grid} />)
    expect(html).toContain('Dimension')
    expect(html).toContain('Postgres')
    expect(html).toContain('Writes')
    expect(html).toContain('medium')
    // the pick marker is a star icon whose <title> reads "Recommended" on hover
    expect(html).toContain('Recommended')
    expect(html).toContain('vp-matrix__pick')
    expect(html).toContain('data-pick="true"')
  })

  it('throws when there are fewer than two columns (error)', () => {
    expect(() =>
      renderToStaticMarkup(
        <Matrix
          data={{ corner: '', columns: [{ name: 'A' }], rows: [{ label: 'r', cells: ['x'] }] }}
        />,
      ),
    ).toThrow(/invalid props/)
  })

  it('renders empty for a row with fewer cells than columns (edge)', () => {
    const html = renderToStaticMarkup(
      <Matrix
        data={{
          corner: '',
          columns: [{ name: 'A' }, { name: 'B' }],
          rows: [{ label: 'r1', cells: ['only'] }],
        }}
      />,
    )
    expect(html).toContain('only')
    expect(html).toContain('r1')
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

  it('defaults the title to "Open questions" and accepts an override (edge)', () => {
    expect(renderToStaticMarkup(<Questions items={['x?']} />)).toContain('Open questions')
    const custom = renderToStaticMarkup(<Questions title='Risks to resolve' items={['x?']} />)
    expect(custom).toContain('Risks to resolve')
    expect(custom).not.toContain('Open questions')
  })

  it('throws on an empty question list (error)', () => {
    expect(() => renderToStaticMarkup(<Questions items={[]} />)).toThrow(/at least one item/)
  })

  it('renders a single question (edge)', () => {
    const html = renderToStaticMarkup(<Questions items={['Only one?']} />)
    expect(html).toContain('Only one?')
  })
})

describe('Questions in review mode', () => {
  function setReviewMode(on: boolean): void {
    ;(globalThis as { __VP_REVIEW__?: boolean }).__VP_REVIEW__ = on || undefined
  }
  afterEach(() => setReviewMode(false))

  it('renders an inline answer field per question in review mode (golden)', () => {
    setReviewMode(true)
    const html = renderToStaticMarkup(
      <ReviewAnswersProvider>
        <Questions items={['Fail open or closed?', 'TTL ok?']} />
      </ReviewAnswersProvider>,
    )
    expect((html.match(/vp-questions__answer/g) || []).length).toBe(2)
    expect(html).toContain('Fail open or closed?')
  })

  it('stays a static list with no answer field outside review mode (edge)', () => {
    setReviewMode(false)
    const html = renderToStaticMarkup(
      <ReviewAnswersProvider>
        <Questions items={['Fail open or closed?']} />
      </ReviewAnswersProvider>,
    )
    expect(html).not.toContain('vp-questions__answer')
  })
})

describe('Questions with multiple-choice options', () => {
  function setReviewMode(on: boolean): void {
    ;(globalThis as { __VP_REVIEW__?: boolean }).__VP_REVIEW__ = on || undefined
  }
  afterEach(() => setReviewMode(false))

  const optioned = [
    { text: 'Rotate refresh tokens?', options: ['Yes, every use', 'Only after 24h'] },
    { text: 'TTL ok?', options: [] },
  ]

  it('renders options as a radio group plus an Other field in review mode (golden)', () => {
    setReviewMode(true)
    const html = renderToStaticMarkup(
      <ReviewAnswersProvider>
        <Questions items={optioned} />
      </ReviewAnswersProvider>,
    )
    expect(html).toContain('role="radiogroup"')
    expect((html.match(/type="radio"/g) || []).length).toBe(2)
    expect(html).toContain('Yes, every use')
    expect(html).toContain('Only after 24h')
    // Both the option question (its Other field) and the free-text question stay answerable.
    expect((html.match(/vp-questions__answer/g) || []).length).toBe(2)
  })

  it('renders options as a plain list, not radios, outside review mode (edge)', () => {
    setReviewMode(false)
    const html = renderToStaticMarkup(<Questions items={optioned} />)
    expect(html).toContain('Yes, every use')
    expect(html).toContain('Only after 24h')
    expect(html).not.toContain('type="radio"')
    expect(html).not.toContain('vp-questions__answer')
  })
})

describe('Questions option selection feeding the feedback payload', () => {
  type G = { __VP_REVIEW__?: boolean; __VP_REVIEW_PLAN_ID__?: string }
  let container: HTMLDivElement
  let root: Root
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    ;(globalThis as G).__VP_REVIEW__ = true
    // Queue mode keeps ReviewLayer off the standalone keepalive/close paths in this jsdom test.
    ;(globalThis as G).__VP_REVIEW_PLAN_ID__ = 'plan-1'
    container = document.createElement('div')
    container.className = 'vp-main'
    document.body.appendChild(container)
    fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    act(() => root?.unmount())
    container.remove()
    ;(globalThis as G).__VP_REVIEW__ = undefined
    ;(globalThis as G).__VP_REVIEW_PLAN_ID__ = undefined
    vi.restoreAllMocks()
  })

  function mountPlan(): void {
    root = createRoot(container)
    act(() =>
      root.render(
        <ReviewAnswersProvider>
          <Questions
            items={[
              { text: 'Rotate refresh tokens?', options: ['Yes, every use', 'Only after 24h'] },
              'Is a 15-minute TTL acceptable?',
            ]}
          />
          <ReviewLayer />
        </ReviewAnswersProvider>,
      ),
    )
  }

  function radioFor(option: string): HTMLInputElement {
    const input = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    ).find(radio => radio.value === option)
    if (!input) throw new Error(`radio for "${option}" not found`)
    return input
  }

  function otherField(): HTMLTextAreaElement {
    const field = container.querySelector<HTMLTextAreaElement>('.vp-questions__answer')
    if (!field) throw new Error('Other field not found')
    return field
  }

  function typeOther(text: string): void {
    const field = otherField()
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    act(() => {
      setter?.call(field, text)
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  async function approve(): Promise<unknown> {
    const button = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.trim() === 'Approve',
    )
    if (!button) throw new Error('Approve button not found')
    await act(async () => {
      button.click()
    })
    const call = fetchMock.mock.calls.find(c => String(c[0]) === '/__vp_feedback')
    if (!call) throw new Error('no feedback POST')
    return JSON.parse((call[1] as RequestInit).body as string)
  }

  it('sends a clicked option as the answer string in the feedback payload (golden)', async () => {
    mountPlan()
    act(() => {
      radioFor('Yes, every use').click()
    })
    const body = (await approve()) as { answers: unknown }
    expect(body.answers).toEqual([{ question: 'Rotate refresh tokens?', answer: 'Yes, every use' }])
  })

  it('lets a typed Other answer override the selected option (golden)', async () => {
    mountPlan()
    act(() => {
      radioFor('Only after 24h').click()
    })
    typeOther('Rotate only on suspicious activity')
    expect(radioFor('Only after 24h').checked).toBe(false)
    const body = (await approve()) as { answers: unknown }
    expect(body.answers).toEqual([
      { question: 'Rotate refresh tokens?', answer: 'Rotate only on suspicious activity' },
    ])
  })

  it('clears the Other text when an option is picked after typing (edge)', () => {
    mountPlan()
    typeOther('half-baked custom answer')
    act(() => {
      radioFor('Yes, every use').click()
    })
    expect(otherField().value).toBe('')
    expect(radioFor('Yes, every use').checked).toBe(true)
  })
})

describe('Questions locked after a decision', () => {
  type G = {
    __VP_REVIEW__?: boolean
    __VP_REVIEW_DECIDED__?: string
    __VP_REVIEW_ANSWERS__?: unknown
  }
  afterEach(() => {
    ;(globalThis as G).__VP_REVIEW__ = undefined
    ;(globalThis as G).__VP_REVIEW_DECIDED__ = undefined
    ;(globalThis as G).__VP_REVIEW_ANSWERS__ = undefined
  })

  it('keeps an answered question as a read-only field and drops an unanswered input once locked (golden)', () => {
    ;(globalThis as G).__VP_REVIEW__ = true
    ;(globalThis as G).__VP_REVIEW_DECIDED__ = 'approve'
    ;(globalThis as G).__VP_REVIEW_ANSWERS__ = [
      { question: 'Fail open or closed?', answer: 'Closed' },
    ]
    const html = renderToStaticMarkup(
      <ReviewAnswersProvider>
        <Questions items={['Fail open or closed?', 'TTL ok?']} />
      </ReviewAnswersProvider>,
    )
    // Only the answered question keeps a field; it is read-only and shows its answer.
    expect((html.match(/vp-questions__answer/g) || []).length).toBe(1)
    expect(html).toMatch(/readonly/i)
    expect(html).toContain('Closed')
    // Both questions still appear as text.
    expect(html).toContain('Fail open or closed?')
    expect(html).toContain('TTL ok?')
  })

  it('keeps every answer field editable while the plan is undecided (edge)', () => {
    ;(globalThis as G).__VP_REVIEW__ = true
    const html = renderToStaticMarkup(
      <ReviewAnswersProvider>
        <Questions items={['A?', 'B?']} />
      </ReviewAnswersProvider>,
    )
    expect((html.match(/vp-questions__answer/g) || []).length).toBe(2)
    expect(html).not.toMatch(/readonly/i)
  })
})

describe('JSON-string data prop (the remark-plan-blocks decode path)', () => {
  // At render the list components receive their data as a JSON string (the markdown
  // children, parsed by the CLI's remark plugin), not an array. Each must decode it.
  it('FileTree decodes a JSON string of file entries', () => {
    const files = JSON.stringify([{ path: 'src/a.ts', change: 'add' }])
    const html = renderToStaticMarkup(<FileTree files={files} />)
    expect(html).toContain('a.ts')
    expect(html).toContain('data-change="add"')
  })

  it('Checklist decodes a JSON string of items', () => {
    const items = JSON.stringify([{ text: 'done item', done: true }])
    const html = renderToStaticMarkup(<Checklist items={items} />)
    expect(html).toContain('done item')
    expect(html).toContain('data-done="true"')
  })

  it('Compare decodes a JSON string of options', () => {
    const options = JSON.stringify([
      { name: 'A', pros: [], cons: [] },
      { name: 'B', pros: [], cons: [] },
    ])
    const html = renderToStaticMarkup(<Compare options={options} />)
    expect(html).toContain('A')
    expect(html).toContain('B')
  })

  it('Questions decodes a JSON string of question strings', () => {
    const html = renderToStaticMarkup(<Questions items={JSON.stringify(['Why?'])} />)
    expect(html).toContain('Why?')
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

describe('Chart', () => {
  // The Chart receives its parsed spec as a JSON string in the `data` prop (the
  // remark-plan-blocks decode path), with `series` and `data` inside.
  const chartData = (series: string[], data: Array<{ label: string; values: number[] }>) =>
    JSON.stringify({ series, data })

  it('renders a single-series bar chart and its title (golden)', () => {
    const html = renderToStaticMarkup(
      <Chart
        type='bar'
        title='Effort'
        data={chartData(['value'], [{ label: 'API', values: [3] }])}
      />,
    )
    expect(html).toContain('vp-chart')
    expect(html).toContain('data-type="bar"')
    expect(html).toContain('Effort')
  })

  it('renders a line chart (golden)', () => {
    const html = renderToStaticMarkup(
      <Chart type='line' data={chartData(['value'], [{ label: 'Auth', values: [12] }])} />,
    )
    expect(html).toContain('vp-chart')
    expect(html).toContain('data-type="line"')
  })

  it('renders a pie chart with its percentage legend list (golden)', () => {
    const html = renderToStaticMarkup(
      <Chart
        type='pie'
        data={chartData(
          ['value'],
          [
            { label: 'A', values: [3] },
            { label: 'B', values: [1] },
          ],
        )}
      />,
    )
    expect(html).toContain('data-type="pie"')
    expect(html).toContain('vp-chart__legend')
    expect(html).toContain('75%')
  })

  it('renders an area chart without throwing and emits the vp-chart markup (golden)', () => {
    const html = renderToStaticMarkup(
      <Chart
        type='area'
        title='Traffic'
        data={chartData(['value'], [{ label: 'Jan', values: [10] }])}
      />,
    )
    expect(html).toContain('vp-chart')
    expect(html).toContain('data-type="area"')
    expect(html).toContain('Traffic')
    // area is a cartesian chart, not a pie, so the pie percentage legend must not render.
    expect(html).not.toContain('vp-chart__legend')
  })

  it('mounts a scatter chart and emits the vp-chart markup (golden)', () => {
    const html = renderToStaticMarkup(
      <Chart type='scatter' data={chartData(['x', 'y'], [{ label: 'A', values: [1, 2] }])} />,
    )
    expect(html).toContain('vp-chart')
    expect(html).toContain('data-type="scatter"')
  })

  it('mounts a radar chart and emits the vp-chart markup (golden)', () => {
    const html = renderToStaticMarkup(
      <Chart
        type='radar'
        data={chartData(
          ['p50', 'p95'],
          [
            { label: 'Auth', values: [1, 2] },
            { label: 'DB', values: [3, 4] },
          ],
        )}
      />,
    )
    expect(html).toContain('vp-chart')
    expect(html).toContain('data-type="radar"')
  })

  it('mounts a gauge chart and emits its legend list (golden)', () => {
    const html = renderToStaticMarkup(
      <Chart type='gauge' data={chartData(['value'], [{ label: 'Done', values: [80] }])} />,
    )
    expect(html).toContain('vp-chart')
    expect(html).toContain('data-type="gauge"')
    expect(html).toContain('vp-chart__legend')
  })

  it('mounts a funnel chart and emits the vp-chart markup (golden)', () => {
    const html = renderToStaticMarkup(
      <Chart type='funnel' data={chartData(['value'], [{ label: 'Visit', values: [100] }])} />,
    )
    expect(html).toContain('vp-chart')
    expect(html).toContain('data-type="funnel"')
  })

  it('mounts a treemap chart and emits the vp-chart markup (golden)', () => {
    const html = renderToStaticMarkup(
      <Chart type='treemap' data={chartData(['value'], [{ label: 'API', values: [60] }])} />,
    )
    expect(html).toContain('vp-chart')
    expect(html).toContain('data-type="treemap"')
  })

  it('mounts a stacked multi-series bar chart (golden)', () => {
    const html = renderToStaticMarkup(
      <Chart
        type='bar'
        stacked
        data={chartData(['p50', 'p95'], [{ label: 'Auth', values: [12, 30] }])}
      />,
    )
    expect(html).toContain('vp-chart')
    expect(html).toContain('data-type="bar"')
  })

  it('accepts the string form of the stacked attribute (edge)', () => {
    const html = renderToStaticMarkup(
      <Chart
        type='area'
        stacked='true'
        data={chartData(['a', 'b'], [{ label: 'x', values: [1, 2] }])}
      />,
    )
    expect(html).toContain('data-type="area"')
  })

  it('throws on an unknown chart type (error)', () => {
    expect(() =>
      renderToStaticMarkup(
        <Chart type='donut' data={chartData(['value'], [{ label: 'x', values: [1] }])} />,
      ),
    ).toThrow(/invalid props/)
  })
})

describe('Stat', () => {
  // The Stat receives its parsed items as a JSON string in the `items` prop (the
  // remark-plan-blocks decode path).
  const statItems = (items: unknown) => JSON.stringify(items)

  it('renders a grid of stat cards with their values, labels, and captions (golden)', () => {
    const html = renderToStaticMarkup(
      <Stat
        title='Impact'
        items={statItems([
          { label: 'Files changed', value: '12' },
          { label: 'RPO', value: '5 min', intent: 'risk', caption: 'worst-case data loss' },
        ])}
      />,
    )
    expect(html).toContain('vp-stat')
    expect(html).toContain('vp-stat__card')
    expect(html).toContain('Impact')
    expect(html).toContain('Files changed')
    expect(html).toContain('12')
    expect(html).toContain('5 min')
    expect(html).toContain('worst-case data loss')
  })

  it('carries the matching data-intent on a card with an intent (edge)', () => {
    const html = renderToStaticMarkup(
      <Stat items={statItems([{ label: 'Est. uptime', value: '99.9%', intent: 'good' }])} />,
    )
    expect(html).toContain('data-intent="good"')
  })

  it('mounts a minimal single-item stat without throwing (golden)', () => {
    const html = renderToStaticMarkup(
      <Stat items={statItems([{ label: 'Files changed', value: '12' }])} />,
    )
    expect(html).toContain('vp-stat')
    expect(html).toContain('Files changed')
  })

  it('throws on an empty item list (error)', () => {
    expect(() => renderToStaticMarkup(<Stat items={statItems([])} />)).toThrow(/at least one item/)
  })
})

describe('ShareButton', () => {
  const setShare = (value: unknown) => {
    ;(globalThis as { __VP_SHARE__?: unknown }).__VP_SHARE__ = value
  }

  afterEach(() => {
    setShare(undefined)
    vi.restoreAllMocks()
  })

  it('renders the share icon and copy popover when plan data is injected (golden)', () => {
    setShare({ data: 'abc123', dev: false })
    const html = renderToStaticMarkup(<ShareButton />)
    expect(html).toContain('vp-share__icon')
    expect(html).toContain('Copy plan to clipboard for sharing')
  })

  it('renders nothing when no plan data is injected (edge)', () => {
    setShare(undefined)
    expect(renderToStaticMarkup(<ShareButton />)).toBe('')
  })

  it('shows a snapshot note on the watch dev server (edge)', () => {
    setShare({ data: 'abc', dev: true })
    const html = renderToStaticMarkup(<ShareButton />)
    expect(html).toContain('vp-share__note')
    expect(html).toContain('snapshot')
  })
})

describe('ThemeToggle', () => {
  it('renders the cog, a Settings title, and a theme dropdown of the three options (golden)', () => {
    const html = renderToStaticMarkup(<ThemeToggle />)
    expect(html).toContain('aria-label="Settings"')
    expect(html).toContain('Settings')
    expect(html).toContain('<select')
    expect(html).toContain('>System</option>')
    expect(html).toContain('<option value="light">Light</option>')
    expect(html).toContain('<option value="dark">Dark</option>')
  })

  it('selects system before any choice is made (edge)', () => {
    // useEffect does not run under static rendering, so the initial preference (system) shows.
    const html = renderToStaticMarkup(<ThemeToggle />)
    expect(html).toMatch(/<option value="system" selected=""?>System<\/option>/)
  })
})

describe('Layout', () => {
  const config = globalThis as { __VP_CONFIG__?: unknown }
  afterEach(() => {
    config.__VP_CONFIG__ = undefined
  })

  it('renders the theme cog when the theme is not locked (golden)', () => {
    const html = renderToStaticMarkup(
      <Layout>
        <p>plan</p>
      </Layout>,
    )
    expect(html).toContain('aria-label="Settings"')
  })

  it('hides the theme cog when the API locked the theme (edge)', () => {
    config.__VP_CONFIG__ = { theme: 'dark', lockTheme: true }
    const html = renderToStaticMarkup(
      <Layout>
        <p>plan</p>
      </Layout>,
    )
    expect(html).not.toContain('aria-label="Settings"')
  })
})

describe('copyText', () => {
  // jsdom does not implement document.execCommand, so install a stub per test and
  // remove it after (restoreAllMocks only reverts spies, not a defined property).
  const stubExecCommand = (result: boolean) => {
    const execCommand = vi.fn().mockReturnValue(result)
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })
    return execCommand
  }

  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(document, 'execCommand')
  })

  it('uses the async clipboard API when available (golden)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    expect(await copyText('https://visualplan.dev/view?data=x')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('https://visualplan.dev/view?data=x')
  })

  it('falls back to execCommand when the clipboard API rejects (edge)', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) },
    })
    const execCommand = stubExecCommand(true)
    expect(await copyText('https://x')).toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('returns false when both the clipboard API and execCommand fail (error)', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) },
    })
    stubExecCommand(false)
    expect(await copyText('https://x')).toBe(false)
  })
})
