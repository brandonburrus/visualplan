import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import type { PluggableList } from 'unified'
import { remarkMath } from './remark-math.js'
import { remarkMermaid } from './remark-mermaid.js'
import { remarkPlanBlocks } from './remark-plan-blocks.js'

/**
 * The ordered remark plugin list shared by the CLI render path and the in-browser `/view`
 * compiler, so a plan's markdown-authored data, mermaid, and math compile identically in both.
 *
 * Order is load-bearing: `remarkPlanBlocks`, `remarkMermaid`, and `remarkMath` run AFTER
 * `remark-gfm` (so task-list `checked` state and GFM tables are available) and, for mermaid/math,
 * BEFORE the rehype highlighter so it never sees those fences.
 */
export const remarkPlugins: PluggableList = [
  remarkFrontmatter,
  [remarkMdxFrontmatter, { name: 'frontmatter' }],
  remarkGfm,
  remarkPlanBlocks,
  remarkMermaid,
  remarkMath,
]
