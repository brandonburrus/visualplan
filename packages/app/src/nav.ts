/** The docs sidebar order. Single source of truth for the sidebar and prev/next. */
export interface DocLink {
  href: string
  label: string
}

export const docLinks: DocLink[] = [
  { href: '/docs/', label: 'Introduction' },
  { href: '/docs/install/', label: 'Installation' },
  { href: '/docs/authoring/', label: 'Authoring plans' },
  { href: '/docs/review/', label: 'Review mode' },
  { href: '/docs/cli/', label: 'CLI reference' },
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
  {
    href: '/examples/add-sso-auth.html',
    label: 'SSO and OAuth2',
    title: 'Add SSO with OAuth2 and OIDC',
  },
  {
    href: '/examples/incident-runbook.html',
    label: 'Incident runbook',
    title: 'Sev1 incident response runbook',
  },
  {
    href: '/examples/churn-model.html',
    label: 'Churn model',
    title: 'Train and ship a churn prediction model',
  },
  {
    href: '/examples/frontend-performance.html',
    label: 'Frontend performance',
    title: "Halve the dashboard's load time",
  },
  {
    href: '/examples/offline-sync.html',
    label: 'Offline sync',
    title: 'Offline-first sync for the mobile app',
  },
  {
    href: '/examples/lakehouse-pipeline.html',
    label: 'Lakehouse pipeline',
    title: 'Build the events lakehouse pipeline',
  },
  {
    href: '/examples/design-system-rollout.html',
    label: 'Design system',
    title: 'Roll out the design system to every app',
  },
]
