import type { ReactNode } from 'react'
import { phaseSchema } from '../shared/catalog.js'
import { validateProps } from './validate.js'

interface PhaseProps {
  title: string
  status?: string
  children?: ReactNode
}

/**
 * One step in the plan's vertical numbered timeline. The step number is supplied
 * by a CSS counter on the timeline container (see `.vp-phase__node` in theme.css),
 * so phases self-number in document order with no index prop.
 */
export function Phase(props: PhaseProps) {
  const { title, status } = validateProps('Phase', phaseSchema, props)
  return (
    <section className='vp-phase' data-status={status}>
      <div className='vp-phase__rail'>
        <div className='vp-phase__node' />
      </div>
      <div className='vp-phase__content'>
        <div className='vp-phase__head'>
          <h3 className='vp-phase__title'>{title}</h3>
          <span className='vp-phase__badge' data-status={status}>
            {status}
          </span>
        </div>
        <div className='vp-phase__body'>{props.children}</div>
      </div>
    </section>
  )
}
