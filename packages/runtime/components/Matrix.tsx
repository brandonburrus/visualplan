import { IconStar } from '@tabler/icons-react'
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
                {/* An inline-flex wrapper vertically centers the star with the column name; a
                    bare SVG with vertical-align sits slightly high relative to the text. */}
                <span className='vp-matrix__colhead'>
                  {column.name}
                  {column.pick ? (
                    // A compact star instead of a full-width chip; the native SVG <title>
                    // surfaces "Recommended" on hover and survives the wrapper's overflow clip.
                    <IconStar size={13} className='vp-matrix__pick' title='Recommended' />
                  ) : null}
                </span>
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
