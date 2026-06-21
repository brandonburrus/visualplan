import { decodePlan } from '@visualplan/core/share'
import { type ReactElement, useEffect, useState } from 'react'
import { PlanErrorCard, PlanSpinner } from './PlanStatus'

/** Soft cap on decoded plan source. A real plan is a few KB; this rejects absurd payloads. */
const MAX_SOURCE_BYTES = 512 * 1024

/** Message posted to the parent /view page so it can size the iframe to the rendered plan. */
const RESIZE_MESSAGE = 'vp-plan-frame-resize'

type State =
  | { kind: 'loading'; label: string }
  | { kind: 'ready'; element: ReactElement }
  | { kind: 'error'; tone: 'calm' | 'malicious'; title: string; message: string }

/**
 * The contents of the sandboxed `/plan-frame` iframe. It reads its own `?data=`, decodes it,
 * enforces the size cap, then lazily loads the compiler (which runs the safety gate and compiles
 * the MDX) and mounts the runtime. Every failure resolves to an explicit state: a calm card for
 * ordinary problems, the bright card for a blocked untrusted payload. It runs in an opaque origin
 * (sandbox without `allow-same-origin`), so it cannot reach the parent page beyond posting height.
 */
export function PlanFrameApp() {
  const [state, setState] = useState<State>({ kind: 'loading', label: 'Loading shared plan...' })

  useEffect(() => {
    let cancelled = false
    const data = new URLSearchParams(window.location.search).get('data')
    if (!data) {
      setState({
        kind: 'error',
        tone: 'calm',
        title: 'No plan to show',
        message: 'This link is missing its plan data.',
      })
      return
    }

    let source: string
    try {
      source = decodePlan(data)
    } catch {
      setState({
        kind: 'error',
        tone: 'calm',
        title: 'This link could not be read',
        message:
          'The plan data is corrupt or incomplete. It may have been cut off when the link was copied.',
      })
      return
    }

    if (new TextEncoder().encode(source).length > MAX_SOURCE_BYTES) {
      setState({
        kind: 'error',
        tone: 'calm',
        title: 'This plan is too big',
        message: `Shared plans are limited to ${Math.round(MAX_SOURCE_BYTES / 1024)} KB of source.`,
      })
      return
    }

    setState({ kind: 'loading', label: 'Rendering plan...' })
    import('../lib/render-plan')
      .then(module => module.renderPlan(source))
      .then(element => {
        if (!cancelled) setState({ kind: 'ready', element })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        // The gate throws UnsafePlanError (matched by name to survive across the lazy chunk
        // boundary); everything else is an ordinary compile failure.
        if (error instanceof Error && error.name === 'UnsafePlanError') {
          setState({
            kind: 'error',
            tone: 'malicious',
            title: 'Blocked: untrusted content',
            message: error.message,
          })
        } else {
          setState({
            kind: 'error',
            tone: 'calm',
            title: 'This plan could not be rendered',
            message: 'The shared source is not a valid plan.',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Report the rendered height to the parent so the iframe has no inner scrollbar. The observer is
  // set up once and fires on every layout change, including the large spinner -> plan jump, so the
  // effect needs no other dependency.
  useEffect(() => {
    const post = () => {
      window.parent.postMessage(
        { type: RESIZE_MESSAGE, height: document.documentElement.scrollHeight },
        '*',
      )
    }
    post()
    const observer = new ResizeObserver(post)
    observer.observe(document.documentElement)
    return () => observer.disconnect()
  }, [])

  if (state.kind === 'loading') return <PlanSpinner label={state.label} />
  if (state.kind === 'error') {
    return <PlanErrorCard tone={state.tone} title={state.title} message={state.message} />
  }
  return state.element
}
