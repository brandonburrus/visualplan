import { readFile } from 'node:fs/promises'
import { compile } from '@mdx-js/mdx'
import { renderMermaidSVG } from 'beautiful-mermaid'
import temml from 'temml'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import remarkMdx from 'remark-mdx'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { CHILD_BLOCK_COMPONENTS, parseBlockChildren } from '@visualplan/compile'
import { CATALOG } from '@visualplan/core'

export interface CheckIssue {
  line: number
  column: number
  message: string
}

interface JsxAttribute {
  type: string
  name?: string
  value?: unknown
}

interface JsxNode {
  type: string
  name?: string | null
  attributes?: JsxAttribute[]
  position?: { start: { line: number; column: number } }
}

const COMPONENT_NAMES = CATALOG.filter(entry => /^[A-Z][A-Za-z0-9]*$/.test(entry.name)).map(
  entry => entry.name,
)

const ENUMS_BY_COMPONENT = new Map(CATALOG.map(entry => [entry.name, entry.staticEnums]))

const BLOCK_COMPONENTS: readonly string[] = CHILD_BLOCK_COMPONENTS

/** Validate a plan's MDX: real compile errors plus static enum / unknown-component checks. */
export async function checkPlan(mdxPath: string): Promise<CheckIssue[]> {
  const source = await readFile(mdxPath, 'utf8')
  const issues: CheckIssue[] = []

  try {
    await compile(source, {
      remarkPlugins: [
        remarkFrontmatter,
        [remarkMdxFrontmatter, { name: 'frontmatter' }],
        remarkGfm,
      ],
    })
  } catch (error) {
    const vfileError = error as {
      line?: number
      column?: number
      place?: { line?: number; column?: number; start?: { line?: number; column?: number } }
      reason?: string
      message?: string
    }
    const message = vfileError.reason ?? vfileError.message ?? 'MDX failed to compile'
    // Some MDX errors (e.g. an unclosed JSX tag) carry no structured position; the
    // location is embedded in the message as "(line:col-line:col)". Fall back to the
    // `place` point, then to the message, so the file:line:col prefix is accurate.
    const placeStart = vfileError.place?.start ?? vfileError.place
    const fromMessage = message.match(/\((\d+):(\d+)/)
    return [
      {
        line: vfileError.line ?? placeStart?.line ?? (fromMessage ? Number(fromMessage[1]) : 1),
        column:
          vfileError.column ?? placeStart?.column ?? (fromMessage ? Number(fromMessage[2]) : 1),
        message,
      },
    ]
  }

  const tree = unified()
    .use(remarkParse)
    .use(remarkFrontmatter)
    .use(remarkGfm)
    .use(remarkMdx)
    .parse(source)

  visit(tree, node => {
    // A ```math fence carries LaTeX that Temml converts at render time; validate it here so a
    // syntax error surfaces as file:line:col instead of an inline error in the rendered page.
    const codeNode = node as {
      type: string
      lang?: string | null
      value?: string
      position?: { start: { line: number; column: number } }
    }
    if (codeNode.type === 'code' && codeNode.lang === 'math') {
      try {
        temml.renderToString(codeNode.value ?? '', { displayMode: true, throwOnError: true })
      } catch (error) {
        const at = codeNode.position?.start ?? { line: 1, column: 1 }
        const reason = error instanceof Error ? error.message : String(error)
        issues.push({
          line: at.line,
          column: at.column,
          message: `Invalid LaTeX in math block: ${reason}`,
        })
      }
      return
    }

    // A ```mermaid fence renders client-side via beautiful-mermaid. Run that same renderer here
    // so a diagram that would throw an inline error box at render time (an unsupported type like
    // pie/gantt, or a malformed header) is caught as file:line:col instead. This is the identical
    // function the Mermaid component calls, so check and render agree on what is renderable.
    if (codeNode.type === 'code' && codeNode.lang === 'mermaid') {
      try {
        renderMermaidSVG(codeNode.value ?? '')
      } catch (error) {
        const at = codeNode.position?.start ?? { line: 1, column: 1 }
        const reason = error instanceof Error ? error.message : String(error)
        issues.push({
          line: at.line,
          column: at.column,
          message: `Invalid mermaid diagram: ${reason}`,
        })
      }
      return
    }

    // A markdown image (`![alt](url)`) compiles to a live <img>, which fetches an external URL (or
    // dangles a local path) at view time and breaks the self-contained output. Raw HTML <img> is
    // already rejected as an unknown component, but the markdown form slips through, so flag it.
    const imageNode = node as {
      type: string
      position?: { start: { line: number; column: number } }
    }
    if (imageNode.type === 'image' || imageNode.type === 'imageReference') {
      const at = imageNode.position?.start ?? { line: 1, column: 1 }
      issues.push({
        line: at.line,
        column: at.column,
        message:
          'Images are not supported: the page must stay self-contained. Use a ```mermaid diagram or describe it in text instead.',
      })
      return
    }

    const element = node as unknown as JsxNode
    if (element.type !== 'mdxJsxFlowElement' && element.type !== 'mdxJsxTextElement') return
    const name = element.name
    if (!name) return
    const at = element.position?.start ?? { line: 1, column: 1 }

    if (!COMPONENT_NAMES.includes(name)) {
      issues.push({
        line: at.line,
        column: at.column,
        message: `Unknown component <${name}>. Valid components: ${COMPONENT_NAMES.join(', ')}.`,
      })
      return
    }

    const enums = ENUMS_BY_COMPONENT.get(name) ?? {}
    for (const [prop, allowed] of Object.entries(enums)) {
      const attribute = element.attributes?.find(
        candidate => candidate.type === 'mdxJsxAttribute' && candidate.name === prop,
      )
      if (attribute && typeof attribute.value === 'string' && !allowed.includes(attribute.value)) {
        issues.push({
          line: at.line,
          column: at.column,
          message: `<${name}> prop ${prop}="${attribute.value}" is invalid. Valid: ${allowed.join(', ')}.`,
        })
      }
    }

    // The list components author their data as markdown children; validate that the
    // children parse into well-formed items (bad change verb, non-numeric chart value).
    if (BLOCK_COMPONENTS.includes(name)) {
      for (const issue of parseBlockChildren(name, node).issues) {
        issues.push(issue)
      }
    }
  })

  return issues
}
