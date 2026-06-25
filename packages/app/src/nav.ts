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
  { href: '/docs/review/', label: 'Review mode' },
  { href: '/docs/programmatic/', label: 'Programmatic interface' },
]

/**
 * The example plans, linked straight to the self-contained HTML the CLI renders into
 * `public/examples/` at build time (scripts/build-examples.mjs). They open in a new tab
 * because each is a standalone plan page, not part of the docs site shell.
 */
export interface ExampleLink {
  href: string
  label: string
  /** The plan's full title, shown as a hover tooltip on the shorter sidebar label. */
  title: string
}

export const exampleLinks: ExampleLink[] = [
  {
    href: '/examples/rate-limiting.html',
    label: 'API rate limiting',
    title: 'Add rate limiting to the API',
  },
  {
    href: '/examples/schema-migration.html',
    label: 'Schema migration',
    title: 'Zero-downtime migration of the orders table',
  },
  {
    href: '/examples/product-launch.html',
    label: 'Product launch',
    title: 'Launch the Insights dashboard',
  },
]
