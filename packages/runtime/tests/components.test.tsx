import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Callout } from '../components/Callout.js'
import { Chart } from '../components/Chart.js'
import { Checklist } from '../components/Checklist.js'
import { Compare } from '../components/Compare.js'
import { FileTree } from '../components/FileTree.js'
import { MathBlock } from '../components/Math.js'
import { Matrix } from '../components/Matrix.js'
import { Phase } from '../components/Phase.js'
import { Questions } from '../components/Questions.js'
import { copyText, ShareButton } from '../components/ShareButton.js'

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
