import { evaluate } from '@mdx-js/mdx'
import { useMDXComponents } from '@mdx-js/react'
import { assertPlanIsSafe, baseExpressiveCodeOptions, remarkPlugins } from '@visualplan/compile'
import type { ComponentType } from 'react'
import * as runtime from 'react/jsx-runtime'
import rehypeExpressiveCode from 'rehype-expressive-code'
import { remarkFileTreeIconsBrowser } from './remark-filetree-icons-browser'

/**
 * Compile a plan's MDX source to a React component IN THE BROWSER, mirroring the CLI's Node render
 * pipeline so a shared plan renders identically to a locally-built one. This module is heavy (MDX +
 * Expressive Code + shiki), so it is imported lazily (a code-split chunk fetched behind a spinner).
 *
 * Two deliberate differences from the CLI, both safe:
 * - The safety gate runs FIRST. The CLI compiles MDX the user authored (trusted); here the source
 *   came from a URL (untrusted), so `assertPlanIsSafe` refuses anything outside the pure
 *   declarative vocabulary before `evaluate` (which is `new Function(...)`) ever runs.
 * - Shiki uses its pure-JavaScript regex engine instead of the default WebAssembly (oniguruma)
 *   engine, so no `.wasm` asset has to load in the browser. This is set only here, never in the
 *   shared `baseExpressiveCodeOptions`, so the CLI keeps oniguruma and its output stays byte-stable.
 */
export async function compilePlan(source: string): Promise<ComponentType> {
  // Refuse untrusted, non-vocabulary content before compiling-and-executing it. Throws
  // UnsafePlanError, which the caller surfaces as the bright "potentially malicious" warning.
  assertPlanIsSafe(source)

  const mdxModule = await evaluate(source, {
    ...runtime,
    useMDXComponents,
    // remarkFileTreeIconsBrowser is appended AFTER the shared list (so it sees the serialized
    // FileTree `files` prop) and lazily code-splits the Material icon set, fetched only when a plan
    // contains a FileTree. Mirrors the CLI's remarkFileTreeIcons but per-icon lazy in the browser.
    remarkPlugins: [...remarkPlugins, remarkFileTreeIconsBrowser],
    rehypePlugins: [
      [rehypeExpressiveCode, { ...baseExpressiveCodeOptions, shiki: { engine: 'javascript' } }],
    ],
  })

  return mdxModule.default as ComponentType
}
