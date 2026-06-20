import { type ReactNode, useEffect } from 'react'
import { initFullscreenControls } from './fullscreen.js'

/** Page shell: a single centered content column. The plan supplies its own
 * `# Title` heading; there is no frontmatter-driven header or sidebar. */
export function Layout({ children }: { children: ReactNode }) {
  // Fullscreen (diagrams + charts only) is wired up once the tree is committed.
  useEffect(() => {
    initFullscreenControls()
  }, [])

  return (
    <div className='vp-shell'>
      <main className='vp-main'>{children}</main>
    </div>
  )
}
