/** The docs sidebar order. Single source of truth for the sidebar and prev/next. */
export interface DocLink {
  href: string
  label: string
}

export const docLinks: DocLink[] = [
  { href: '/docs/', label: 'Introduction' },
  { href: '/docs/install/', label: 'Installation' },
  { href: '/docs/authoring/', label: 'Authoring plans' },
  { href: '/docs/cli/', label: 'CLI reference' },
]
