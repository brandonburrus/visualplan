import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from 'recharts'
import { chartSchema } from '@visualplan/core'
import { ExpandButton } from './ExpandButton.js'
import { decodeJson, validateProps } from './validate.js'

interface ChartProps {
  type?: unknown
  title?: unknown
  // MDX boolean shorthand `<Chart stacked>` yields `true`; `stacked="true"` yields the string.
  stacked?: unknown
  data: unknown
}

// Vibrant but balanced palette, readable on both the light and dark card surface.
const COLORS = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#a855f7',
  '#ec4899',
  '#84cc16',
]

const AXIS_TICK = { fill: 'var(--vp-muted)', fontSize: 12 }

/** Compact large axis numbers (100000 -> 100k) so y-axis ticks never clip. */
function formatTick(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${+(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${+(value / 1_000).toFixed(1)}k`
  return `${value}`
}
const TOOLTIP_STYLE = {
  background: 'var(--vp-surface)',
  border: '1px solid var(--vp-border)',
  borderRadius: 8,
  color: 'var(--vp-text)',
}

const LEGEND_STYLE = { fontSize: 12, color: 'var(--vp-muted)' }
const MARGIN = { top: 4, right: 8, bottom: 0, left: -16 }

interface ChartPoint {
  label: string
  values: number[]
}

interface ChartBody {
  rows: Array<Record<string, string | number>>
  keys: string[]
  multi: boolean
  stacked: boolean
  series: string[]
  data: ChartPoint[]
  pieData: Array<{ label: string; value: number }>
}

function renderBar({ rows, keys, multi, stacked }: ChartBody) {
  return (
    <BarChart data={rows} margin={MARGIN}>
      <CartesianGrid strokeDasharray='3 3' stroke='var(--vp-border)' vertical={false} />
      <XAxis dataKey='label' tick={AXIS_TICK} stroke='var(--vp-border)' />
      <YAxis allowDecimals tick={AXIS_TICK} stroke='var(--vp-border)' tickFormatter={formatTick} />
      <Tooltip cursor={{ fill: 'var(--vp-surface-2)' }} contentStyle={TOOLTIP_STYLE} />
      {multi ? <Legend wrapperStyle={LEGEND_STYLE} /> : null}
      {keys.map((key, seriesIndex) => (
        <Bar
          key={key}
          dataKey={key}
          stackId={stacked ? 'a' : undefined}
          radius={[4, 4, 0, 0]}
          maxBarSize={64}
          fill={COLORS[seriesIndex % COLORS.length]}
          isAnimationActive={false}
        >
          {multi
            ? null
            : rows.map((row, index) => (
                <Cell key={String(row.label)} fill={COLORS[index % COLORS.length]} />
              ))}
        </Bar>
      ))}
    </BarChart>
  )
}

function renderLine({ rows, keys, multi }: ChartBody) {
  return (
    <LineChart data={rows} margin={MARGIN}>
      <CartesianGrid strokeDasharray='3 3' stroke='var(--vp-border)' vertical={false} />
      <XAxis dataKey='label' tick={AXIS_TICK} stroke='var(--vp-border)' />
      <YAxis allowDecimals tick={AXIS_TICK} stroke='var(--vp-border)' tickFormatter={formatTick} />
      <Tooltip contentStyle={TOOLTIP_STYLE} />
      {multi ? <Legend wrapperStyle={LEGEND_STYLE} /> : null}
      {keys.map((key, seriesIndex) => (
        <Line
          key={key}
          type='monotone'
          dataKey={key}
          stroke={COLORS[seriesIndex % COLORS.length]}
          strokeWidth={2.5}
          dot={{ fill: COLORS[seriesIndex % COLORS.length], r: 3 }}
          isAnimationActive={false}
        />
      ))}
    </LineChart>
  )
}

function renderArea({ rows, keys, multi, stacked }: ChartBody) {
  return (
    <AreaChart data={rows} margin={MARGIN}>
      <CartesianGrid strokeDasharray='3 3' stroke='var(--vp-border)' vertical={false} />
      <XAxis dataKey='label' tick={AXIS_TICK} stroke='var(--vp-border)' />
      <YAxis allowDecimals tick={AXIS_TICK} stroke='var(--vp-border)' tickFormatter={formatTick} />
      <Tooltip contentStyle={TOOLTIP_STYLE} />
      {multi ? <Legend wrapperStyle={LEGEND_STYLE} /> : null}
      {keys.map((key, seriesIndex) => (
        <Area
          key={key}
          type='monotone'
          dataKey={key}
          stackId={stacked ? 'a' : undefined}
          stroke={COLORS[seriesIndex % COLORS.length]}
          fill={COLORS[seriesIndex % COLORS.length]}
          fillOpacity={0.2}
          strokeWidth={2.5}
          dot={{ fill: COLORS[seriesIndex % COLORS.length], r: 3 }}
          isAnimationActive={false}
        />
      ))}
    </AreaChart>
  )
}

function renderPie({ pieData }: ChartBody) {
  return (
    <PieChart>
      <Tooltip contentStyle={TOOLTIP_STYLE} />
      <Pie
        data={pieData}
        dataKey='value'
        nameKey='label'
        outerRadius={88}
        stroke='none'
        isAnimationActive={false}
      >
        {pieData.map((point, index) => (
          <Cell key={point.label} fill={COLORS[index % COLORS.length]} />
        ))}
      </Pie>
    </PieChart>
  )
}

function renderScatter({ data, series }: ChartBody) {
  const points = data.map(point => ({
    x: point.values[0] ?? 0,
    y: point.values[1] ?? 0,
    label: point.label,
  }))
  return (
    <ScatterChart margin={MARGIN}>
      <CartesianGrid strokeDasharray='3 3' stroke='var(--vp-border)' />
      <XAxis
        type='number'
        dataKey='x'
        name={series[0]}
        tick={AXIS_TICK}
        stroke='var(--vp-border)'
        tickFormatter={formatTick}
      />
      <YAxis
        type='number'
        dataKey='y'
        name={series[1]}
        tick={AXIS_TICK}
        stroke='var(--vp-border)'
        tickFormatter={formatTick}
      />
      <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={TOOLTIP_STYLE} />
      <Scatter data={points} isAnimationActive={false}>
        {points.map((point, index) => (
          <Cell key={point.label} fill={COLORS[index % COLORS.length]} />
        ))}
      </Scatter>
    </ScatterChart>
  )
}

function renderRadar({ rows, keys, multi }: ChartBody) {
  return (
    <RadarChart data={rows}>
      <PolarGrid stroke='var(--vp-border)' />
      <PolarAngleAxis dataKey='label' tick={AXIS_TICK} />
      {/* Hide the numeric radius scale: recharts renders its ticks rotated along the axis angle,
          which reads as an illegible vertical strip. A plan radar compares shape, not exact radii. */}
      <PolarRadiusAxis tick={false} axisLine={false} stroke='var(--vp-border)' />
      {multi ? <Legend wrapperStyle={LEGEND_STYLE} /> : null}
      {keys.map((key, seriesIndex) => (
        <Radar
          key={key}
          dataKey={key}
          stroke={COLORS[seriesIndex % COLORS.length]}
          fill={COLORS[seriesIndex % COLORS.length]}
          fillOpacity={0.2}
          isAnimationActive={false}
        />
      ))}
    </RadarChart>
  )
}

function renderGauge({ data }: ChartBody) {
  const points = data.map((point, index) => ({
    label: point.label,
    value: point.values[0] ?? 0,
    fill: COLORS[index % COLORS.length],
  }))
  return (
    <RadialBarChart
      data={points}
      innerRadius='45%'
      outerRadius='100%'
      startAngle={180}
      endAngle={0}
    >
      <PolarAngleAxis type='number' domain={[0, 100]} tick={false} />
      <RadialBar dataKey='value' background cornerRadius={4} isAnimationActive={false} />
      <Tooltip contentStyle={TOOLTIP_STYLE} />
    </RadialBarChart>
  )
}

function renderFunnel({ data }: ChartBody) {
  const points = data.map((point, index) => ({
    label: point.label,
    value: point.values[0] ?? 0,
    fill: COLORS[index % COLORS.length],
  }))
  return (
    <FunnelChart>
      <Tooltip contentStyle={TOOLTIP_STYLE} />
      <Funnel dataKey='value' data={points} isAnimationActive={false}>
        <LabelList dataKey='label' position='right' fill='var(--vp-text)' stroke='none' />
      </Funnel>
    </FunnelChart>
  )
}

interface TreemapContentProps {
  x?: number
  y?: number
  width?: number
  height?: number
  index?: number
  name?: string
  fill?: string
}

/** A treemap tile: a filled rect plus a label when the tile is wide and tall enough to read. */
function TreemapTile({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  index = 0,
  name,
  fill,
}: TreemapContentProps) {
  const color = fill ?? COLORS[index % COLORS.length]
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={color} stroke='var(--vp-surface)' />
      {width > 56 && height > 24 ? (
        <text x={x + 6} y={y + 18} fill='var(--vp-surface)' fontSize={12}>
          {name}
        </text>
      ) : null}
    </g>
  )
}

function renderTreemap({ data }: ChartBody) {
  const nodes = data.map((point, index) => ({
    name: point.label,
    size: point.values[0] ?? 0,
    fill: COLORS[index % COLORS.length],
  }))
  return (
    <Treemap
      data={nodes}
      dataKey='size'
      stroke='var(--vp-surface)'
      isAnimationActive={false}
      content={<TreemapTile />}
    />
  )
}

const CHART_BODIES = {
  bar: renderBar,
  line: renderLine,
  area: renderArea,
  scatter: renderScatter,
  radar: renderRadar,
  gauge: renderGauge,
  funnel: renderFunnel,
  treemap: renderTreemap,
  pie: renderPie,
}

/** A bar/line/area/pie chart for estimates or metrics, backed by recharts. Single series comes
 * from a `- label: value` list; multiple series from a table with one column per series. */
export function Chart(props: ChartProps) {
  const decoded = (decodeJson(props.data) ?? {}) as { series?: unknown; data?: unknown }
  const { type, title, stacked, series, data } = validateProps('Chart', chartSchema, {
    type: props.type,
    title: props.title,
    // The MDX boolean shorthand `<Chart stacked>` is `true`; `stacked="true"` is the string.
    stacked: props.stacked === true || props.stacked === 'true',
    series: decoded.series,
    data: decoded.data,
  })
  const multi = series.length > 1
  // recharts wants one object per category with a key per series. Single-series charts use the
  // synthetic key "value" so the existing per-point coloring (a Cell per bar/slice) still applies.
  const keys = multi ? series : ['value']
  const rows = data.map(point => {
    const row: Record<string, string | number> = { label: point.label }
    keys.forEach((key, index) => {
      row[key] = point.values[index] ?? 0
    })
    return row
  })
  const pieData = data.map(point => ({ label: point.label, value: point.values[0] ?? 0 }))
  const pieTotal = pieData.reduce((sum, point) => sum + point.value, 0)
  const renderBody = CHART_BODIES[type]
  return (
    <figure className='vp-chart vp-expandable'>
      {title ? <figcaption className='vp-chart__title'>{title}</figcaption> : null}
      <div className='vp-chart__canvas' data-type={type}>
        <ResponsiveContainer width='100%' height='100%'>
          {renderBody({ rows, keys, multi, stacked: stacked === true, series, data, pieData })}
        </ResponsiveContainer>
      </div>
      {type === 'pie' ? (
        <ul className='vp-chart__legend'>
          {pieData.map((point, index) => (
            <li key={point.label} className='vp-chart__legend-item'>
              <span
                className='vp-chart__swatch'
                style={{ background: COLORS[index % COLORS.length] }}
                aria-hidden='true'
              />
              <span className='vp-chart__legend-label'>{point.label}</span>
              <span className='vp-chart__legend-value'>
                {pieTotal > 0 ? `${Math.round((point.value / pieTotal) * 100)}%` : point.value}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {type === 'gauge' ? (
        <ul className='vp-chart__legend'>
          {pieData.map((point, index) => (
            <li key={point.label} className='vp-chart__legend-item'>
              <span
                className='vp-chart__swatch'
                style={{ background: COLORS[index % COLORS.length] }}
                aria-hidden='true'
              />
              <span className='vp-chart__legend-label'>{point.label}</span>
              <span className='vp-chart__legend-value'>{point.value}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <ExpandButton />
    </figure>
  )
}
