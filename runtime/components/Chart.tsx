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
import { chartSchema } from '../shared/catalog.js'
import { validateProps } from './validate.js'

interface ChartProps {
  type: string
  title?: string
  data: Array<{ label: string; value: number }>
}

const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899']

/** A bar/line/pie chart for estimates or metrics, backed by recharts. */
export function Chart(props: ChartProps) {
  const { type, title, data } = validateProps('Chart', chartSchema, props)
  return (
    <figure className='vp-chart'>
      {title ? <figcaption className='vp-chart__title'>{title}</figcaption> : null}
      <div className='vp-chart__canvas'>
        <ResponsiveContainer width='100%' height={260}>
          {type === 'bar' ? (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray='3 3' stroke='var(--vp-border)' />
              <XAxis dataKey='label' />
              <YAxis allowDecimals />
              <Tooltip />
              <Bar dataKey='value' radius={[4, 4, 0, 0]}>
                {data.map((point, index) => (
                  <Cell key={point.label} fill={PALETTE[index % PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          ) : type === 'line' ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray='3 3' stroke='var(--vp-border)' />
              <XAxis dataKey='label' />
              <YAxis allowDecimals />
              <Tooltip />
              <Line type='monotone' dataKey='value' stroke={PALETTE[0]} strokeWidth={2} />
            </LineChart>
          ) : (
            <PieChart>
              <Tooltip />
              <Legend />
              <Pie data={data} dataKey='value' nameKey='label' outerRadius={100} label>
                {data.map((point, index) => (
                  <Cell key={point.label} fill={PALETTE[index % PALETTE.length]} />
                ))}
              </Pie>
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
