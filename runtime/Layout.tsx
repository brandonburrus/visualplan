import { type ReactNode, useEffect, useState } from 'react'

export interface PlanMeta {
  title?: string
  date?: string
  author?: string
}

interface TocItem {
  id: string
  title: string
  status: string
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/** Page chrome: title header, a sticky table-of-contents built from the
 * rendered <Phase> sections, and the plan body. */
export function Layout({ meta, children }: { meta: PlanMeta; children: ReactNode }) {
  const [toc, setToc] = useState<TocItem[]>([])

  useEffect(() => {
    const phases = Array.from(document.querySelectorAll<HTMLElement>('.vp-phase'))
    const items = phases.map((phase, index) => {
      const title = phase.querySelector('.vp-phase__title')?.textContent ?? `Phase ${index + 1}`
      const id = phase.id || slugify(title) || `phase-${index + 1}`
      phase.id = id
      return { id, title, status: phase.dataset.status ?? 'planned' }
    })
    setToc(items)
  }, [])

  return (
    <div className='vp-shell'>
      <header className='vp-header'>
        <h1 className='vp-header__title'>{meta.title ?? 'Plan'}</h1>
        <div className='vp-header__meta'>
          {meta.author ? <span>{meta.author}</span> : null}
          {meta.date ? <span>{meta.date}</span> : null}
        </div>
      </header>
      <div className='vp-layout'>
        {toc.length > 0 ? (
          <nav className='vp-toc' aria-label='Plan phases'>
            <div className='vp-toc__label'>Phases</div>
            <ol className='vp-toc__list'>
              {toc.map(item => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className='vp-toc__link' data-status={item.status}>
                    {item.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <main className='vp-main'>{children}</main>
      </div>
    </div>
  )
}
