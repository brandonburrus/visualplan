import { IconCheck, IconShare3 } from '@tabler/icons-react'
import { copyText } from '@visualplan/runtime/components/ShareButton'
import { useEffect, useRef, useState } from 'react'

/** The iframe starts at this height and grows to its content via postMessage from the frame. */
const MIN_HEIGHT = 640

const RESIZE_MESSAGE = 'vp-plan-frame-resize'

/**
 * The /view host page. It reads `?data=` and embeds the plan in a sandboxed `/plan-frame` iframe
 * (`allow-scripts`, no `allow-same-origin`, so the plan renders in an opaque origin that cannot
 * touch this page). The frame does all decoding, the safety gate, and compilation; this page only
 * hosts it, sizes it from the frame's height messages, and offers a button to re-share the link.
 */
export function ViewPage() {
  // `undefined` until hydration reads the URL, so server and first client render agree (no flash).
  const [data, setData] = useState<string | null | undefined>(undefined)
  const [height, setHeight] = useState(MIN_HEIGHT)
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    setData(new URLSearchParams(window.location.search).get('data'))
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Trust only the message from our own frame; its opaque-origin events have origin "null".
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return
      const message = event.data as { type?: string; height?: number }
      if (message?.type === RESIZE_MESSAGE && typeof message.height === 'number') {
        setHeight(Math.max(MIN_HEIGHT, Math.ceil(message.height)))
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  if (data === undefined) return null
  if (!data) return <NoPlan />

  // base64url is URL-safe; URLSearchParams encodes it correctly for the frame's own `?data=`.
  const frameSrc = `/plan-frame/?${new URLSearchParams({ data }).toString()}`

  return (
    <div className='vp-view'>
      <ReShareButton />
      <iframe
        ref={frameRef}
        className='vp-view__frame'
        src={frameSrc}
        title='Shared plan'
        sandbox='allow-scripts'
        style={{ height }}
      />
    </div>
  )
}

/** Copies the current `/view?data=...` URL so a viewed plan can be passed on. */
function ReShareButton() {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    const ok = await copyText(window.location.href)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    }
  }
  return (
    <button type='button' className='vp-view__share' onClick={onCopy}>
      {copied ? <IconCheck size={15} /> : <IconShare3 size={15} />}
      {copied ? 'Link copied' : 'Copy link'}
    </button>
  )
}

/** Shown when /view is opened with no `?data=` payload. */
function NoPlan() {
  return (
    <div className='vp-noplan'>
      <h1>Nothing to show here</h1>
      <p>
        This page renders plans shared as a link. Open a <code>visualplan.dev/view?data=...</code>{' '}
        link, or create one with the share button on any plan you build with{' '}
        <a href='/docs/'>vplan</a>.
      </p>
    </div>
  )
}
