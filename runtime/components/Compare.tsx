import { IconCheck, IconX } from '@tabler/icons-react'
import { compareSchema } from '../shared/catalog.js'
import { validateProps } from './validate.js'

interface CompareProps {
  options: Array<{ name: string; pros?: string[]; cons?: string[]; pick?: boolean }>
}

/** Side-by-side option cards for weighing approaches. */
export function Compare(props: CompareProps) {
  const { options } = validateProps('Compare', compareSchema, props)
  return (
    <div className='vp-compare'>
      {options.map(option => (
        <div
          key={option.name}
          className='vp-compare__card'
          data-pick={option.pick ? 'true' : 'false'}
        >
          <div className='vp-compare__name'>
            {option.name}
            {option.pick ? <span className='vp-compare__pick'>recommended</span> : null}
          </div>
          <div className='vp-compare__lists'>
            <ul className='vp-compare__pros'>
              {option.pros.map(pro => (
                <li key={pro}>
                  <IconCheck
                    size={15}
                    stroke={2.5}
                    className='vp-compare__pro'
                    aria-hidden='true'
                  />
                  <span>{pro}</span>
                </li>
              ))}
            </ul>
            <ul className='vp-compare__cons'>
              {option.cons.map(con => (
                <li key={con}>
                  <IconX size={15} stroke={2.5} className='vp-compare__con' aria-hidden='true' />
                  <span>{con}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  )
}
