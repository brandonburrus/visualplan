import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'
import { reviewAnswers, reviewDecided } from './feedback.js'

/** Answers the reviewer typed into the plan's `Questions`, keyed by the question text. */
interface ReviewAnswersValue {
  answers: Map<string, string>
  setAnswer: (question: string, answer: string) => void
  /** True once the plan is decided: `Questions` then stop accepting edits (answered ones stay
   * visible, read-only). Seeded true when re-opening an already-decided plan. */
  locked: boolean
  /** Lock answers when the reviewer submits a decision. */
  lock: () => void
}

/**
 * Shared answer state lifted above both the inline `Questions` (which write answers) and the
 * `ReviewSession` (which folds them into the feedback payload). A leaf module with no dependency on
 * `ReviewLayer`, so importing it from `Questions` cannot create a cycle and adds ~nothing to a
 * normal render. Outside review mode it simply holds an empty map nobody reads.
 */
const ReviewAnswersContext = createContext<ReviewAnswersValue | null>(null)

/** Seed answers from the daemon's injection so a re-opened decided plan shows what was answered. */
function seedAnswers(): Map<string, string> {
  const map = new Map<string, string>()
  for (const { question, answer } of reviewAnswers()) map.set(question, answer)
  return map
}

export function ReviewAnswersProvider({ children }: { children: ReactNode }) {
  const [answers, setAnswers] = useState<Map<string, string>>(seedAnswers)
  // A re-served decided plan opens locked; a fresh review locks when the reviewer submits.
  const [locked, setLocked] = useState<boolean>(() => reviewDecided() !== null)
  // A fresh Map per write so reference-based effect deps in ReviewSession fire on every keystroke.
  const value = useMemo<ReviewAnswersValue>(
    () => ({
      answers,
      setAnswer: (question, answer) => setAnswers(prev => new Map(prev).set(question, answer)),
      locked,
      lock: () => setLocked(true),
    }),
    [answers, locked],
  )
  return <ReviewAnswersContext.Provider value={value}>{children}</ReviewAnswersContext.Provider>
}

/** Read the shared answer state. Returns null when no provider is mounted (e.g. a unit test). */
export function useQuestionAnswers(): ReviewAnswersValue | null {
  return useContext(ReviewAnswersContext)
}
