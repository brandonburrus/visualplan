import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'

/** Answers the reviewer typed into the plan's `Questions`, keyed by the question text. */
interface ReviewAnswersValue {
  answers: Map<string, string>
  setAnswer: (question: string, answer: string) => void
}

/**
 * Shared answer state lifted above both the inline `Questions` (which write answers) and the
 * `ReviewSession` (which folds them into the feedback payload). A leaf module with no dependency on
 * `ReviewLayer`, so importing it from `Questions` cannot create a cycle and adds ~nothing to a
 * normal render. Outside review mode it simply holds an empty map nobody reads.
 */
const ReviewAnswersContext = createContext<ReviewAnswersValue | null>(null)

export function ReviewAnswersProvider({ children }: { children: ReactNode }) {
  const [answers, setAnswers] = useState<Map<string, string>>(() => new Map())
  // A fresh Map per write so reference-based effect deps in ReviewSession fire on every keystroke.
  const value = useMemo<ReviewAnswersValue>(
    () => ({
      answers,
      setAnswer: (question, answer) => setAnswers(prev => new Map(prev).set(question, answer)),
    }),
    [answers],
  )
  return <ReviewAnswersContext.Provider value={value}>{children}</ReviewAnswersContext.Provider>
}

/** Read the shared answer state. Returns null when no provider is mounted (e.g. a unit test). */
export function useQuestionAnswers(): ReviewAnswersValue | null {
  return useContext(ReviewAnswersContext)
}
