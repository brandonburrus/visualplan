import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { chartSchema } from '@visualplan/core'
import { ExpandButton } from './ExpandButton.js'
import { decodeJson, validateProps } from './validate.js'

interface ChartProps {
  type?: unknown
  title?: unknown
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

/** A bar/line/pie chart for estimates or metrics, backed by recharts. Single series comes from a
 * `- label: value` list; multiple series from a table with one column per series. */
export function Chart(props: ChartProps) {
  const decoded = (decodeJson(props.data) ?? {}) as { series?: unknown; data?: unknown }
  const { type, title, series, data } = validateProps('Chart', chartSchema, {
    type: props.type,
    title: props.title,
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
  return (
    <figure className='vp-chart vp-expandable'>
      {title ? <figcaption className='vp-chart__title'>{title}</figcaption> : null}
      <div className='vp-chart__canvas' data-type={type}>
        <ResponsiveContainer width='100%' height='100%'>
          {type === 'bar' ? (
            <BarChart data={rows} margin={MARGIN}>
              <CartesianGrid strokeDasharray='3 3' stroke='var(--vp-border)' vertical={false} />
              <XAxis dataKey='label' tick={AXIS_TICK} stroke='var(--vp-border)' />
              <YAxis
                allowDecimals
                tick={AXIS_TICK}
                stroke='var(--vp-border)'
                tickFormatter={formatTick}
              />
              <Tooltip cursor={{ fill: 'var(--vp-surface-2)' }} contentStyle={TOOLTIP_STYLE} />
              {multi ? <Legend wrapperStyle={LEGEND_STYLE} /> : null}
              {keys.map((key, seriesIndex) => (
                <Bar
                  key={key}
                  dataKey={key}
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
          ) : type === 'line' ? (
            <LineChart data={rows} margin={MARGIN}>
              <CartesianGrid strokeDasharray='3 3' stroke='var(--vp-border)' vertical={false} />
              <XAxis dataKey='label' tick={AXIS_TICK} stroke='var(--vp-border)' />
              <YAxis
                allowDecimals
                tick={AXIS_TICK}
                stroke='var(--vp-border)'
                tickFormatter={formatTick}
              />
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
          ) : (
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
          )}
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
      <ExpandButton />
    </figure>
  )
}
