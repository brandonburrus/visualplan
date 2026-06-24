import { type ReactNode, useEffect } from 'react'
import { ReviewLayer } from './components/review/ReviewLayer.js'
import { ShareButton } from './components/ShareButton.js'
import { ThemeToggle } from './components/ThemeToggle.js'
import { initFullscreenControls } from './fullscreen.js'
import { isThemeLocked } from './theme.js'

/** Page shell: a single centered content column. The plan supplies its own
 * `# Title` heading; there is no frontmatter-driven header or sidebar. The theme cog
 * and share button are fixed to the viewport corner, so their position in the tree is incidental.
 * The cog is hidden when the API locked the theme; the share button self-hides when its data was
 * not injected (the API's `enableSharing: false`). */
export function Layout({ children }: { children: ReactNode }) {
  // Fullscreen (diagrams + charts only) is wired up once the tree is committed.
  useEffect(() => {
    initFullscreenControls()
  }, [])

  return (
    <div className='vp-shell'>
      <ShareButton />
      {!isThemeLocked() && <ThemeToggle />}
      <main className='vp-main'>{children}</main>
      <ReviewLayer />
    </div>
  )
}
