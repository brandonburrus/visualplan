import type { ReactNode } from 'react'
import { phaseSchema } from '../shared/catalog.js'
import { validateProps } from './validate.js'

interface PhaseProps {
  title: string
  status?: string
  children?: ReactNode
}

/** A collapsible plan stage with a status badge. Wraps markdown children. */
export function Phase(props: PhaseProps) {
  const { title, status } = validateProps('Phase', phaseSchema, props)
  return (
    <details className='vp-phase' data-status={status} open>
      <summary className='vp-phase__summary'>
        <span className='vp-phase__title'>{title}</span>
        <span className='vp-phase__badge' data-status={status}>
          {status}
        </span>
      </summary>
      <div className='vp-phase__body'>{props.children}</div>
    </details>
  )
}
