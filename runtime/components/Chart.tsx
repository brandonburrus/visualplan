import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { chartSchema } from '../shared/catalog.js'
import { validateProps } from './validate.js'

interface ChartProps {
  type: string
  title?: string
  data: Array<{ label: string; value: number }>
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
const TOOLTIP_STYLE = {
  background: 'var(--vp-surface)',
  border: '1px solid var(--vp-border)',
  borderRadius: 8,
  color: 'var(--vp-text)',
}

/** A bar/line/pie chart for estimates or metrics, backed by recharts. */
export function Chart(props: ChartProps) {
  const { type, title, data } = validateProps('Chart', chartSchema, props)
  const total = data.reduce((sum, point) => sum + point.value, 0)
  return (
    <figure className='vp-chart'>
      {title ? <figcaption className='vp-chart__title'>{title}</figcaption> : null}
      <div className='vp-chart__canvas'>
        <ResponsiveContainer width='100%' height={type === 'pie' ? 220 : 250}>
          {type === 'bar' ? (
            <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray='3 3' stroke='var(--vp-border)' vertical={false} />
              <XAxis dataKey='label' tick={AXIS_TICK} stroke='var(--vp-border)' />
              <YAxis allowDecimals tick={AXIS_TICK} stroke='var(--vp-border)' />
              <Tooltip cursor={{ fill: 'var(--vp-surface-2)' }} contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey='value' radius={[4, 4, 0, 0]} maxBarSize={64}>
                {data.map((point, index) => (
                  <Cell key={point.label} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          ) : type === 'line' ? (
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray='3 3' stroke='var(--vp-border)' vertical={false} />
              <XAxis dataKey='label' tick={AXIS_TICK} stroke='var(--vp-border)' />
              <YAxis allowDecimals tick={AXIS_TICK} stroke='var(--vp-border)' />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line
                type='monotone'
                dataKey='value'
                stroke={COLORS[0]}
                strokeWidth={2.5}
                dot={{ fill: COLORS[0], r: 3 }}
              />
            </LineChart>
          ) : (
            <PieChart>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Pie data={data} dataKey='value' nameKey='label' outerRadius={88} stroke='none'>
                {data.map((point, index) => (
                  <Cell key={point.label} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
      {type === 'pie' ? (
        <ul className='vp-chart__legend'>
          {data.map((point, index) => (
            <li key={point.label} className='vp-chart__legend-item'>
              <span
                className='vp-chart__swatch'
                style={{ background: COLORS[index % COLORS.length] }}
                aria-hidden='true'
              />
              <span className='vp-chart__legend-label'>{point.label}</span>
              <span className='vp-chart__legend-value'>
                {total > 0 ? `${Math.round((point.value / total) * 100)}%` : point.value}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </figure>
  )
}
