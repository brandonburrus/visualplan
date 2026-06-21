import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMdx from 'remark-mdx'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { CATALOG } from '@visualplan/core'

/**
 * The static safety gate for untrusted plans. `/view` decodes MDX from a URL parameter and
 * would compile-and-EXECUTE it (MDX is `new Function(...)`), so a crafted `?data=` is an
 * arbitrary-code-execution vector. This gate parses the source to its AST (parsing does NOT
 * execute) and walks it against an allowlist: a legitimate plan is pure declarative vocabulary
 * with zero JavaScript, so the presence of ANY executable construct, unknown element, event
 * handler, embedded image, or dangerous URL scheme is the injection signal and the plan is
 * refused before `evaluate` is ever called. The sandboxed iframe contains anything that slips
 * through; this gate is the first of those layers. Mirrors the parser `check.ts` uses, so the
 * gate sees exactly the structure the author wrote.
 */

/** Thrown when a plan contains anything outside the pure declarative vocabulary. */
export class UnsafePlanError extends Error {
  readonly line: number
  readonly column: number
  constructor(message: string, line: number, column: number) {
    super(message)
    this.name = 'UnsafePlanError'
    this.line = line
    this.column = column
  }
}

/**
 * Components auto-injected into every plan's MDX scope (the runtime `components` map): CATALOG's
 * PascalCase entries plus Mermaid/Math, whose CATALOG names are the lowercase code-fence forms.
 * A shared plan authors mermaid/math as fenced code blocks (which stay `code` nodes here, not
 * JSX), but `<Mermaid>` / `<Math>` are allowed anyway as known-safe declarative components.
 */
const VOCABULARY = new Set<string>([
  ...CATALOG.filter(entry => /^[A-Z][A-Za-z0-9]*$/.test(entry.name)).map(entry => entry.name),
  'Mermaid',
  'Math',
])

/** Inert mdast node types a plan's markdown and data compile from: static markup, no JavaScript. */
const ALLOWED_NODES = new Set<string>([
  'root',
  'yaml',
  'toml',
  'paragraph',
  'heading',
  'text',
  'emphasis',
  'strong',
  'delete',
  'inlineCode',
  'code',
  'break',
  'thematicBreak',
  'blockquote',
  'list',
  'listItem',
  'table',
  'tableRow',
  'tableCell',
  'link',
  'linkReference',
  'definition',
  'footnoteReference',
  'footnoteDefinition',
  // Vocabulary JSX, name-checked in the walk below:
  'mdxJsxFlowElement',
  'mdxJsxTextElement',
])

/** mdast nodes that carry executable JavaScript, with a human label for the error. */
const EXECUTABLE_NODES: Record<string, string> = {
  mdxjsEsm: 'an import/export statement',
  mdxFlowExpression: 'a { } expression',
  mdxTextExpression: 'a { } expression',
}

interface PlanAttribute {
  type: string
  name?: string | null
  value?: unknown
}

interface PlanNode {
  type: string
  name?: string | null
  url?: string
  attributes?: PlanAttribute[]
  position?: { start?: { line: number; column: number } }
}

/**
 * A link URL is safe only if it has no scheme (relative path, anchor, fragment) or an
 * http/https/mailto scheme. `javascript:`, `data:`, `vbscript:`, `file:` and the like execute or
 * exfiltrate, so they are refused. The markdown parser delivers a clean destination here (it drops
 * a link whose URL contains whitespace or control characters, and decodes HTML entities such as
 * `&#x3a;` to `:` first), so this only needs to compare the resolved scheme.
 */
function urlIsSafe(url: string): boolean {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)
  if (!scheme) return true
  const name = (scheme[1] ?? '').toLowerCase()
  return name === 'http' || name === 'https' || name === 'mailto'
}

/**
 * Parse a plan's MDX source and reject it if it is anything other than the pure declarative
 * vocabulary. Throws `UnsafePlanError` on the first violation; returns normally for a clean plan.
 * Does not execute the source.
 */
export function assertPlanIsSafe(source: string): void {
  const tree = unified()
    .use(remarkParse)
    .use(remarkFrontmatter)
    .use(remarkGfm)
    .use(remarkMdx)
    .parse(source)

  visit(tree, node => {
    const current = node as PlanNode
    const at = current.position?.start ?? { line: 1, column: 1 }
    const reject = (reason: string): never => {
      throw new UnsafePlanError(
        `This shared link contains ${reason}, which a plan never does. It was treated as untrusted, potentially malicious content and was not rendered.`,
        at.line,
        at.column,
      )
    }

    const executable = EXECUTABLE_NODES[current.type]
    if (executable) reject(executable)
    if (current.type === 'mdxJsxExpressionAttribute') reject('a { } expression attribute')
    if (current.type === 'html') reject('raw HTML')
    if (current.type === 'image' || current.type === 'imageReference') {
      reject('an embedded image (an external network request)')
    }

    if (current.type === 'link' || current.type === 'linkReference') {
      if (current.url && !urlIsSafe(current.url)) {
        reject(`an unsafe link URL (${current.url.slice(0, 40)})`)
      }
      return
    }

    if (current.type === 'mdxJsxFlowElement' || current.type === 'mdxJsxTextElement') {
      const name = current.name
      // A fragment (<>...</>) has no name; it is inert grouping, so allow it.
      if (name && !VOCABULARY.has(name)) reject(`an unknown <${name}> element`)
      for (const attribute of current.attributes ?? []) {
        if (attribute.type === 'mdxJsxExpressionAttribute') {
          reject('a { } spread or expression attribute')
        }
        if (attribute.type === 'mdxJsxAttribute') {
          if (attribute.name && /^on[a-z]/i.test(attribute.name)) {
            reject(`an event handler (${attribute.name})`)
          }
          // A string attribute has a string value; an expression-valued attribute
          // (prop={...}) carries arbitrary JS and arrives as a non-null object here.
          if (attribute.value !== null && typeof attribute.value === 'object') {
            reject(`a { } expression in the ${attribute.name ?? ''} attribute`)
          }
        }
      }
      return
    }

    if (!ALLOWED_NODES.has(current.type)) reject(`an unsupported construct (${current.type})`)
  })
}
