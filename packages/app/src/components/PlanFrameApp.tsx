import { decodePlan } from '@visualplan/core/share'
import { type ReactElement, useEffect, useState } from 'react'
import { PlanErrorCard, PlanSpinner } from './PlanStatus'

/** Hard cap on decoded plan source, enforced during decompression. A real plan is a few KB. */
const MAX_SOURCE_BYTES = 512 * 1024

/** Message posted to the parent /view page so it can size the iframe to the rendered plan. */
const RESIZE_MESSAGE = 'vp-plan-frame-resize'

/** Message posted to the parent with the plan's name, so it can title the browser tab. */
const TITLE_MESSAGE = 'vp-plan-frame-title'

/** A plan's title is its first `# ` heading (BOM-stripped), mirroring the CLI's planTitle. */
function planTitle(source: string): string | null {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source
  return text.match(/^# (.+?)\s*$/m)?.[1]?.trim() || null
}

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
    // Seed the runtime share button (rendered by Layout) with this plan's data, so the frame shows
    // the same faint top-right share control every plan has. It rebuilds the visualplan.dev/view
    // link from this payload; `dev: false` keeps it from probing the CLI's watch endpoint.
    ;(globalThis as { __VP_SHARE__?: { data: string; dev: boolean } }).__VP_SHARE__ = {
      data,
      dev: false,
    }

    let source: string
    try {
      // Bounded decode: aborts a decompression bomb before it can exhaust memory.
      source = decodePlan(data, MAX_SOURCE_BYTES)
    } catch (error) {
      if (error instanceof Error && error.name === 'PlanTooLargeError') {
        setState({
          kind: 'error',
          tone: 'calm',
          title: 'This plan is too big',
          message: `Shared plans are limited to ${Math.round(MAX_SOURCE_BYTES / 1024)} KB of source.`,
        })
      } else {
        setState({
          kind: 'error',
          tone: 'calm',
          title: 'This link could not be read',
          message:
            'The plan data is corrupt or incomplete. It may have been cut off when the link was copied.',
        })
      }
      return
    }

    // Tell the parent the plan's name so it can title the browser tab; the parent owns the visible
    // title (this frame's own document title is not shown).
    window.parent.postMessage({ type: TITLE_MESSAGE, title: planTitle(source) }, '*')

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
