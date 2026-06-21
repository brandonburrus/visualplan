import { questionsSchema } from '@visualplan/core'
import { decodeJson, validateProps } from './validate.js'

interface QuestionsProps {
  title?: unknown
  items: unknown
}

/** Open questions for the reader to resolve before building, as a highlighted panel. */
export function Questions(props: QuestionsProps) {
  const { title, items } = validateProps('Questions', questionsSchema, {
    ...props,
    items: decodeJson(props.items),
  })
  return (
    <section className='vp-questions'>
      <div className='vp-questions__title'>{title}</div>
      <ol className='vp-questions__list'>
        {items.map((item, index) => (
          <li key={item} className='vp-questions__item'>
            <span className='vp-questions__num' aria-hidden='true'>
              {index + 1}
            </span>
            <span className='vp-questions__text'>{item}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
