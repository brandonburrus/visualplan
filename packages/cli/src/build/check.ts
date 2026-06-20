import { readFile } from 'node:fs/promises'
import { compile } from '@mdx-js/mdx'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import remarkMdx from 'remark-mdx'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
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
      reason?: string
      message?: string
    }
    return [
      {
        line: vfileError.line ?? 1,
        column: vfileError.column ?? 1,
        message: vfileError.reason ?? vfileError.message ?? 'MDX failed to compile',
      },
    ]
  }

  const tree = unified().use(remarkParse).use(remarkFrontmatter).use(remarkMdx).parse(source)

  visit(tree, node => {
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
  })

  return issues
}
