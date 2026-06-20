import { IconMaximize } from '@tabler/icons-react'
import { toggleFullscreen } from '../fullscreen.js'

/**
 * A hover-revealed fullscreen toggle for a React-rendered surface (diagram, chart).
 * It fullscreens its nearest `.vp-expandable` ancestor, so the host just needs that
 * class and `position: relative` (both in theme.css).
 */
export function ExpandButton() {
  return (
    <button
      type='button'
      className='vp-expand-btn'
      aria-label='Toggle fullscreen'
      onClick={event => toggleFullscreen(event.currentTarget.closest('.vp-expandable'))}
    >
      <IconMaximize size={16} stroke={2} />
    </button>
  )
}
