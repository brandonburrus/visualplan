import { Callout } from '@visualplan/runtime/components/Callout'
import { Checklist } from '@visualplan/runtime/components/Checklist'
import { FileTree } from '@visualplan/runtime/components/FileTree'
import { Mermaid } from '@visualplan/runtime/components/Mermaid'
import { Phase } from '@visualplan/runtime/components/Phase'
import { Questions } from '@visualplan/runtime/components/Questions'
import { ReviewAnswersProvider } from '@visualplan/runtime/components/review/ReviewAnswers'
import { ReviewLayer } from '@visualplan/runtime/components/review/ReviewLayer'

// Turn review mode on AND mark it a demo before the layer mounts. Demo mode keeps every decision in
// the page: no CLI server is posted to, the tab is never closed, and the beforeunload prompt is off,
// so the embedded preview is safe to click through and to reset by reloading the frame. This mirrors
// the CLI build's `__VP_REVIEW__` injection; the module runs only in the browser (the frame mounts it
// `client:only`), so assigning on `globalThis` is assigning on `window`.
const globals = globalThis as { __VP_REVIEW__?: boolean; __VP_REVIEW_DEMO__?: boolean }
globals.__VP_REVIEW__ = true
globals.__VP_REVIEW_DEMO__ = true

const ARCHITECTURE =
  'flowchart LR\n  Client --> Gateway --> Limiter --> API\n  Limiter --> Redis[(Redis)]'

/**
 * A self-contained dummy plan with the real review layer mounted over it, exactly as `vplan render
 * --review` produces. It replicates the runtime's `Layout` shape (an `.vp-main` column the section
 * collector reads, wrapped in `ReviewAnswersProvider` so the inline `Questions` answers flow into the
 * feedback). It is rendered inside the `/review-demo-frame` iframe so the layer's viewport-fixed
 * chrome (the decision bar, the section overlays) stays contained to the preview.
 */
export function ReviewDemo() {
  return (
    <ReviewAnswersProvider>
      <div className='vp-shell'>
        <main className='vp-main'>
          <h1>Add rate limiting to the API</h1>
          <p>
            Add a sliding-window limiter at the gateway, behind a flag, then ramp it from 1% to 100%
            while watching the rejection rate.
          </p>
          <Mermaid chart={ARCHITECTURE} />
          <Phase title='Build the limiter' status='done'>
            Implement the Redis-backed sliding window and return 429 over the limit.
          </Phase>
          <Phase title='Wire the middleware' status='active'>
            Mount the limiter behind the flag and send a Retry-After header on rejection.
          </Phase>
          <Phase title='Dashboards' status='planned'>
            Emit metrics and chart the rejection rate so the ramp can be watched.
          </Phase>
          <Callout type='risk'>A Redis outage must fail open, not closed.</Callout>
          <FileTree
            files={[
              { path: 'src/gateway/rate-limiter.ts', change: 'add' },
              { path: 'src/gateway/middleware.ts', change: 'modify' },
              { path: 'src/gateway/legacy/', change: 'delete' },
            ]}
          />
          <Questions
            items={[
              'Should the limiter fail open or fail closed if Redis is unreachable?',
              'Is a per-IP limit enough, or do we need per-API-key buckets too?',
            ]}
          />
          <Checklist
            title='Done when'
            items={[
              { text: 'Returns 429 over the limit', done: true },
              { text: 'Dashboards live', done: false },
            ]}
          />
        </main>
        <ReviewLayer />
      </div>
    </ReviewAnswersProvider>
  )
}
