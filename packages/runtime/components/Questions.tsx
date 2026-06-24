import { questionsSchema } from '@visualplan/core'
import { isReviewMode } from './review/feedback.js'
import { useQuestionAnswers } from './review/ReviewAnswers.js'
import { decodeJson, validateProps } from './validate.js'

interface QuestionsProps {
  title?: unknown
  items: unknown
}

/** Open questions for the reader to resolve before building, as a highlighted panel. In a review
 * session each question becomes directly answerable; otherwise it is a static numbered list. */
export function Questions(props: QuestionsProps) {
  const { title, items } = validateProps('Questions', questionsSchema, {
    ...props,
    items: decodeJson(props.items),
  })
  const answers = useQuestionAnswers()
  const interactive = isReviewMode() && answers !== null
  return (
    <section className='vp-questions'>
      <div className='vp-questions__title'>{title}</div>
      <ol className='vp-questions__list'>
        {items.map((item, index) => (
          <li key={item} className='vp-questions__item'>
            <span className='vp-questions__num' aria-hidden='true'>
              {index + 1}
            </span>
            <div className='vp-questions__body'>
              <span className='vp-questions__text'>{item}</span>
              {interactive && (
                <textarea
                  className='vp-questions__answer'
                  rows={1}
                  placeholder='Answer this question…'
                  aria-label={`Answer: ${item}`}
                  value={answers.answers.get(item) ?? ''}
                  onChange={event => answers.setAnswer(item, event.target.value)}
                />
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
