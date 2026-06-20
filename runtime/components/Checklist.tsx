import { IconSquare, IconSquareCheckFilled } from '@tabler/icons-react'
import { checklistSchema } from '../shared/catalog.js'
import { validateProps } from './validate.js'

interface ChecklistProps {
  title?: string
  items: Array<{ text: string; done?: boolean }>
}

/** Acceptance criteria / definition of done, with done and todo states. */
export function Checklist(props: ChecklistProps) {
  const { title, items } = validateProps('Checklist', checklistSchema, props)
  return (
    <section className='vp-checklist'>
      {title ? <div className='vp-checklist__title'>{title}</div> : null}
      <ul className='vp-checklist__list'>
        {items.map(item => (
          <li
            key={item.text}
            className='vp-checklist__item'
            data-done={item.done ? 'true' : 'false'}
          >
            {item.done ? (
              <IconSquareCheckFilled size={17} className='vp-checklist__check' aria-hidden='true' />
            ) : (
              <IconSquare size={17} stroke={2} className='vp-checklist__box' aria-hidden='true' />
            )}
            <span className='vp-checklist__text'>{item.text}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
