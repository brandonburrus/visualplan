import { IconAlertTriangle, IconLoader2 } from '@tabler/icons-react'

/** A loading state shown while the shared plan decodes and the compiler chunk streams in. */
export function PlanSpinner({ label }: { label: string }) {
  return (
    <div className='vp-pv-status' role='status' aria-live='polite'>
      <IconLoader2 className='vp-pv-spin' size={28} aria-hidden='true' />
      <p>{label}</p>
    </div>
  )
}

/**
 * `calm` is an ordinary failure (missing/corrupt/oversized link, or a source that will not
 * compile). `malicious` is the bright, alarming variant shown only when the safety gate blocks a
 * link carrying untrusted, potentially malicious content. The two are visually distinct on purpose.
 */
export type ErrorTone = 'calm' | 'malicious'

export function PlanErrorCard({
  tone,
  title,
  message,
}: {
  tone: ErrorTone
  title: string
  message: string
}) {
  return (
    <div className={`vp-pv-error vp-pv-error--${tone}`} role='alert'>
      {tone === 'malicious' && <IconAlertTriangle size={26} aria-hidden='true' />}
      <div>
        <h1>{title}</h1>
        <p>{message}</p>
        <a className='vp-pv-error__docs' href='/docs/authoring/'>
          What is a shared plan?
        </a>
      </div>
    </div>
  )
}
