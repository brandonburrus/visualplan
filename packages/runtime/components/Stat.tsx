import { statSchema } from '@visualplan/core'
import { decodeJson, validateProps } from './validate.js'

interface StatProps {
  title?: unknown
  items: unknown
}

/** Headline plan metrics as a responsive grid of cards (value, label, optional caption). */
export function Stat(props: StatProps) {
  const { title, items } = validateProps('Stat', statSchema, {
    ...props,
    items: decodeJson(props.items),
  })
  return (
    <section className='vp-stat'>
      {title ? <div className='vp-stat__title'>{title}</div> : null}
      <div className='vp-stat__grid'>
        {items.map(item => (
          <div key={item.label} className='vp-stat__card' data-intent={item.intent}>
            <div className='vp-stat__value'>{item.value}</div>
            <div className='vp-stat__label'>{item.label}</div>
            {item.caption ? <div className='vp-stat__caption'>{item.caption}</div> : null}
          </div>
        ))}
      </div>
    </section>
  )
}
