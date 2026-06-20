import type { ReactNode } from 'react'
import { calloutSchema } from '../shared/catalog.js'
import { validateProps } from './validate.js'

interface CalloutProps {
  type?: string
  children?: ReactNode
}

const LABEL: Record<string, string> = {
  note: 'Note',
  risk: 'Risk',
  decision: 'Decision',
  warn: 'Warning',
}

/** A highlighted note/risk/decision/warning block. Wraps markdown children. */
export function Callout(props: CalloutProps) {
  const { type } = validateProps('Callout', calloutSchema, props)
  return (
    <aside className='vp-callout' data-type={type}>
      <div className='vp-callout__label'>{LABEL[type]}</div>
      <div className='vp-callout__body'>{props.children}</div>
    </aside>
  )
}
