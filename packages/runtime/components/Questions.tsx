import { questionsSchema } from '@visualplan/core'
import { type ComponentProps, useLayoutEffect, useRef } from 'react'
import { isReviewMode } from './review/feedback.js'
import { useQuestionAnswers } from './review/ReviewAnswers.js'
import { decodeJson, validateProps } from './validate.js'

/** A textarea that grows to fit its content, so a long answer is never cramped into one scrolling
 * line. Resets to `auto` before measuring so it shrinks as well as grows; `useLayoutEffect` sizes it
 * before paint to avoid a flash at the wrong height. Pairs with `resize: none` in the CSS. */
function AutoGrowTextarea(props: ComponentProps<'textarea'>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  // Re-measure whenever the value changes; the effect reads it via the DOM (scrollHeight), not
  // directly, so the dependency is intentional even though biome cannot see the use.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resize on every value change
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [props.value])
  return <textarea ref={ref} {...props} />
}

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
  // Once the plan is decided the answer fields lock: an answered question stays visible (read-only),
  // an unanswered one reverts to a plain question.
  const locked = answers?.locked ?? false
  return (
    <section className='vp-questions'>
      <div className='vp-questions__title'>{title}</div>
      <ol className='vp-questions__list'>
        {items.map((item, index) => {
          const answer = answers?.answers.get(item) ?? ''
          const showInput = interactive && (!locked || answer.trim() !== '')
          return (
            <li key={item} className='vp-questions__item'>
              <span className='vp-questions__num' aria-hidden='true'>
                {index + 1}
              </span>
              <div className='vp-questions__body'>
                <span className='vp-questions__text'>{item}</span>
                {showInput && answers && (
                  <AutoGrowTextarea
                    className='vp-questions__answer'
                    rows={1}
                    placeholder='Answer this question…'
                    aria-label={`Answer: ${item}`}
                    value={answer}
                    readOnly={locked}
                    onChange={event => answers.setAnswer(item, event.target.value)}
                  />
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
