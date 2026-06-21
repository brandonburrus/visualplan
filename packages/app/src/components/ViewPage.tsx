import { useEffect, useRef, useState } from 'react'

/** The iframe starts at this height and grows to its content via postMessage from the frame. */
const MIN_HEIGHT = 640

const RESIZE_MESSAGE = 'vp-plan-frame-resize'

/** Where the consumed `?data=` is stashed so a reload still finds the plan after the URL is cleaned. */
const STORAGE_KEY = 'vp-view-data'

/**
 * The /view host page. It reads `?data=`, then embeds the plan in a sandboxed `/plan-frame` iframe
 * (`allow-scripts`, no `allow-same-origin`, so the plan renders in an opaque origin that cannot
 * touch this page). The frame does all decoding, the safety gate, compilation, AND its own share
 * button (the runtime one, identical to every plan). This page only hosts and sizes the frame.
 *
 * The `?data=` payload is consumed on load: it is stashed in sessionStorage and stripped from the
 * address bar (so a long share link does not linger there), while a reload still restores the plan
 * from the stash. The shareable link itself is reproduced by the in-frame share button.
 */
export function ViewPage() {
  // `undefined` until hydration reads the URL, so server and first client render agree (no flash).
  const [data, setData] = useState<string | null | undefined>(undefined)
  const [height, setHeight] = useState(MIN_HEIGHT)
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('data')
    if (fromUrl) {
      try {
        sessionStorage.setItem(STORAGE_KEY, fromUrl)
      } catch {
        // Private mode or storage disabled: skip the stash; the in-frame link still works.
      }
      // Consume the param: clean the address bar without a navigation or history entry.
      window.history.replaceState(null, '', window.location.pathname)
      setData(fromUrl)
      return
    }
    try {
      setData(sessionStorage.getItem(STORAGE_KEY))
    } catch {
      setData(null)
    }
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
      <iframe
        ref={frameRef}
        className='vp-view__frame'
        src={frameSrc}
        title='Shared plan'
        sandbox='allow-scripts'
        // The plan renders its own (runtime) share button inside the frame; grant it clipboard
        // access so copying the link works despite the opaque-origin sandbox.
        allow='clipboard-write'
        style={{ height }}
      />
    </div>
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
