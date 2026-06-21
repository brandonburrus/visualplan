/**
 * The isomorphic surface of the shared compile pipeline, imported by both the vplan CLI (Node
 * render path) and the `/view` page (in-browser compiler). It deliberately does NOT re-export
 * `./file-icons`, which reads SVGs from disk and is Node-only; the CLI imports that subpath
 * directly so the browser bundle never pulls in `material-icon-theme`.
 */
export {
  BLOCK_DATA_ATTR,
  type BlockIssue,
  type BlockResult,
  CHILD_BLOCK_COMPONENTS,
  parseBlockChildren,
} from './plan-blocks.js'
export { baseExpressiveCodeOptions } from './expressive-code.js'
export { remarkPlugins } from './pipeline.js'
export { remarkMath } from './remark-math.js'
export { remarkMermaid } from './remark-mermaid.js'
export { remarkPlanBlocks } from './remark-plan-blocks.js'
export { assertPlanIsSafe, UnsafePlanError } from './safety-gate.js'
