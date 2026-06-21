import { IconCheck, IconShare3 } from '@tabler/icons-react'
import { useState } from 'react'

/** The page `/view` lives at on visualplan.dev; the share link points here. */
const VIEW_URL = 'https://visualplan.dev/view'

/** Injected onto `globalThis` by the CLI build (compile.ts `planSharePlugin`). */
interface PlanShare {
  /** The plan's MDX source, deflated + base64url, for the `?data=` link. */
  data: string
  /** True on the `--watch` dev server, where the link is a point-in-time snapshot. */
  dev: boolean
}

function readShare(): PlanShare | undefined {
  return (globalThis as { __VP_SHARE__?: PlanShare }).__VP_SHARE__
}

/**
 * On the `--watch` dev server the file changes after the page loaded, so fetch the
 * freshest encoding at click time; fall back to the value injected at load if the
 * dev endpoint is unreachable. A built (file) plan is static, so its injected data is final.
 */
async function currentData(share: PlanShare): Promise<string> {
  if (!share.dev) return share.data
  try {
    const res = await fetch('/__vp_share', { cache: 'no-store' })
    if (res.ok) {
      const fresh = (await res.text()).trim()
      if (fresh) return fresh
    }
  } catch {
    // Endpoint gone (server stopped); the injected snapshot is the best we have.
  }
  return share.data
}

/**
 * Copy `text`, returning whether it worked. `navigator.clipboard` is unavailable
 * or blocked in some contexts (notably a plan opened from `file://`), so fall back
 * to a hidden textarea + `execCommand`; the caller reveals the link to copy by hand
 * if both fail.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      const ok = document.execCommand('copy')
      textarea.remove()
      return ok
    } catch {
      return false
    }
  }
}

type Status = 'idle' | 'copied' | 'manual'

/**
 * A faint top-right icon that brightens and opens a copy popover on hover or focus.
 * Clicking the icon (or the popover's button) copies a stateless
 * `visualplan.dev/view?data=...` link encoding this whole plan. Renders nothing when
 * no plan data was injected (e.g. a unit test, or the runtime mounted without the build).
 */
export function ShareButton() {
  const share = readShare()
  const [status, setStatus] = useState<Status>('idle')
  const [url, setUrl] = useState('')
  if (!share) return null

  const copied = status === 'copied'

  const onCopy = async () => {
    const link = `${VIEW_URL}?data=${await currentData(share)}`
    setUrl(link)
    const ok = await copyText(link)
    setStatus(ok ? 'copied' : 'manual')
    if (ok) window.setTimeout(() => setStatus('idle'), 1600)
  }

  return (
    // The manual fallback needs the popover to stay open (no hover) so the link can be
    // selected, so force it open in that state.
    <div className='vp-share' data-open={status === 'manual'}>
      <button
        type='button'
        className='vp-share__icon'
        data-copied={copied}
        onClick={onCopy}
        aria-label='Copy a shareable link to this plan'
        title='Copy a shareable link to this plan'
      >
        {copied ? <IconCheck size={17} /> : <IconShare3 size={17} />}
      </button>
      <div className='vp-share__pop'>
        <button type='button' className='vp-share__copy' data-copied={copied} onClick={onCopy}>
          {copied ? <IconCheck size={16} /> : <IconShare3 size={16} />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
        {share.dev && (
          <p className='vp-share__note'>Shares a snapshot of the plan as it is right now</p>
        )}
        {status === 'manual' && (
          <input
            className='vp-share__input'
            readOnly
            value={url}
            onFocus={event => event.currentTarget.select()}
            ref={node => {
              node?.select()
            }}
          />
        )}
      </div>
    </div>
  )
}
