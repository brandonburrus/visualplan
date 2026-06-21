import { matrixSchema } from '@visualplan/core'
import { decodeJson, validateProps } from './validate.js'

interface MatrixProps {
  data: unknown
}

/**
 * A comparison grid: options across the columns, criteria down the rows. One column can be
 * marked the recommended pick (highlighted). Use this for a scorecard; use Compare for pros/cons.
 */
export function Matrix(props: MatrixProps) {
  const { corner, columns, rows } = validateProps('Matrix', matrixSchema, decodeJson(props.data))
  return (
    <div className='vp-matrix-wrap'>
      <table className='vp-matrix'>
        <thead>
          <tr>
            <th scope='col' className='vp-matrix__corner'>
              {corner}
            </th>
            {columns.map(column => (
              <th
                key={column.name}
                scope='col'
                className='vp-matrix__col'
                data-pick={column.pick ? 'true' : 'false'}
              >
                {column.name}
                {column.pick ? <span className='vp-matrix__pick'>recommended</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label}>
              <th scope='row' className='vp-matrix__rowlabel'>
                {row.label}
              </th>
              {columns.map((column, index) => (
                <td key={column.name} data-pick={column.pick ? 'true' : 'false'}>
                  {row.cells[index] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
