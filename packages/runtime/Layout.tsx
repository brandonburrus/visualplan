import { type ReactNode, useEffect } from 'react'
import { ShareButton } from './components/ShareButton.js'
import { ThemeToggle } from './components/ThemeToggle.js'
import { initFullscreenControls } from './fullscreen.js'

/** Page shell: a single centered content column. The plan supplies its own
 * `# Title` heading; there is no frontmatter-driven header or sidebar. The theme cog
 * and share button are fixed to the viewport corner, so their position in the tree is incidental. */
export function Layout({ children }: { children: ReactNode }) {
  // Fullscreen (diagrams + charts only) is wired up once the tree is committed.
  useEffect(() => {
    initFullscreenControls()
  }, [])

  return (
    <div className='vp-shell'>
      <ThemeToggle />
      <ShareButton />
      <main className='vp-main'>{children}</main>
    </div>
  )
}
