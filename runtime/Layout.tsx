import type { ReactNode } from 'react'

/** Page shell: a single centered content column. The plan supplies its own
 * `# Title` heading; there is no frontmatter-driven header or sidebar. */
export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className='vp-shell'>
      <main className='vp-main'>{children}</main>
    </div>
  )
}
