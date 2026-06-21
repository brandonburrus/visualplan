import { MDXProvider } from '@mdx-js/react'
import { components } from '@visualplan/runtime'
import { Layout } from '@visualplan/runtime/Layout'
import type { ReactElement } from 'react'
import { compilePlan } from './compile-browser'
import '@visualplan/runtime/theme.css'

/**
 * Compile a shared plan and wrap it in the runtime shell, the same `MDXProvider` + `Layout` +
 * component map the CLI mounts, so an in-browser render is structurally identical to a locally
 * built plan. Pulled in lazily by PlanFrameApp behind a spinner, so the heavy compiler and runtime
 * (MDX, Expressive Code, shiki, recharts) are a code-split chunk rather than part of the frame's
 * initial load. The runtime's `ShareButton` self-hides here because no `__VP_SHARE__` is injected.
 */
export async function renderPlan(source: string): Promise<ReactElement> {
  const Content = await compilePlan(source)
  return (
    <MDXProvider components={components}>
      <Layout>
        <Content />
      </Layout>
    </MDXProvider>
  )
}
