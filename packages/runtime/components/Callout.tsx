import {
  IconAlertTriangle,
  IconBulb,
  IconInfoCircle,
  type IconProps,
  IconSparkles,
} from '@tabler/icons-react'
import type { FC, ReactNode } from 'react'
import { calloutSchema } from '@visualplan/core'
import { validateProps } from './validate.js'

interface CalloutProps {
  type?: string
  children?: ReactNode
}

const LABEL: Record<string, string> = {
  note: 'Note',
  tip: 'Tip',
  risk: 'Risk',
  decision: 'Decision',
  warn: 'Warning',
}

const ICON: Record<string, FC<IconProps>> = {
  note: IconInfoCircle,
  tip: IconSparkles,
  decision: IconBulb,
  risk: IconAlertTriangle,
  warn: IconAlertTriangle,
}

/** A highlighted note/tip/risk/decision/warning block. Wraps markdown children. */
export function Callout(props: CalloutProps) {
  const { type } = validateProps('Callout', calloutSchema, props)
  const Icon = ICON[type] ?? IconInfoCircle
  return (
    <aside className='vp-callout' data-type={type}>
      <div className='vp-callout__label'>
        <Icon size={14} stroke={2} aria-hidden='true' />
        {LABEL[type]}
      </div>
      <div className='vp-callout__body'>{props.children}</div>
    </aside>
  )
}
