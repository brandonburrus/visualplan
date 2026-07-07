import { questionsSchema } from '@visualplan/core'
import { type ComponentProps, useId, useLayoutEffect, useRef } from 'react'
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
 * session each question becomes directly answerable; a question authored with multiple-choice
 * options additionally offers them as a radio group beside an "Other" free-text field. Outside a
 * review the options render as a plain sub-list. */
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
  // Radio groups need a page-unique name per question so sibling Questions panels never merge.
  const groupBase = useId()
  return (
    <section className='vp-questions'>
      <div className='vp-questions__title'>{title}</div>
      <ol className='vp-questions__list'>
        {items.map((item, index) => {
          const answer = answers?.answers.get(item.text) ?? ''
          const selectable = interactive && !locked && item.options.length > 0
          const showInput = interactive && (!locked || answer.trim() !== '')
          // The single answer string is the source of truth: an answer matching an option reads as
          // that option selected (Other empty); anything else reads as custom text (no selection).
          // Picking an option and typing in Other therefore clear each other with no extra state.
          const selected = selectable && item.options.includes(answer) ? answer : null
          return (
            <li key={item.text} className='vp-questions__item'>
              <span className='vp-questions__num' aria-hidden='true'>
                {index + 1}
              </span>
              <div className='vp-questions__body'>
                <span className='vp-questions__text'>{item.text}</span>
                {item.options.length > 0 && !selectable && (
                  <ul className='vp-questions__options'>
                    {item.options.map(option => (
                      <li key={option} className='vp-questions__option'>
                        {option}
                      </li>
                    ))}
                  </ul>
                )}
                {selectable && answers && (
                  <div
                    className='vp-questions__options'
                    role='radiogroup'
                    aria-label={`Options: ${item.text}`}
                  >
                    {item.options.map(option => (
                      <label key={option} className='vp-questions__option'>
                        <input
                          type='radio'
                          name={`${groupBase}-${index}`}
                          value={option}
                          checked={selected === option}
                          onChange={() => answers.setAnswer(item.text, option)}
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                )}
                {showInput && answers && (
                  <AutoGrowTextarea
                    className='vp-questions__answer'
                    rows={1}
                    placeholder={selectable ? 'Other…' : 'Answer this question…'}
                    aria-label={selectable ? `Other answer: ${item.text}` : `Answer: ${item.text}`}
                    value={selected ? '' : answer}
                    readOnly={locked}
                    onChange={event => answers.setAnswer(item.text, event.target.value)}
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
