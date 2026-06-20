/**
 * The user's plan file, injected at build time via a Vite alias
 * (`virtual:plan` -> the absolute path of the .mdx being rendered).
 */
declare module 'virtual:plan' {
  import type { ComponentType } from 'react'

  const Plan: ComponentType
  export default Plan
  export const frontmatter: Record<string, unknown> | undefined
}
