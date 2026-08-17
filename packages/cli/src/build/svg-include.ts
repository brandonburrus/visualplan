import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, isAbsolute, resolve } from 'node:path'
import { fromHtml } from 'hast-util-from-html'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMdx from 'remark-mdx'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import type { CheckIssue } from './check.js'

/**
 * `<Svg src="…">` inlining — the one place a plan may pull in a file.
 *
 * A plan page is a single self-contained HTML file, so a diagram authored by another tool (an
 * architecture/sequence/data-flow SVG) can only appear if its markup is embedded at build time.
 * This module does that at the SOURCE level: it finds every `<Svg src="…">` in the MDX, reads
 * the file relative to the plan, sanitizes it, and rewrites the tag to carry the markup as a
 * plain string attribute (`svg="…"`, HTML-entity-escaped). Working on the source string rather
 * than inside the Vite/MDX pipeline keeps every consumer identical — `render`, `check`, `share`,
 * `export`, `--watch`, the review daemon (which is handed source, not a path) and the browser
 * `/view` compiler (whose safety gate refuses `{ }` expression attributes; a string attribute passes)
 * all see the same already-inlined plan.
 *
 * Sanitization is an allow-list and REJECTS rather than strips: an author should know their
 * diagram was refused, not discover a silently altered one. Refused: `<script>`, `<foreignObject>`,
 * `<iframe>`/`<object>`/`<embed>`/`<image>`, any `on*` attribute, any `href`/`xlink:href` that is
 * not a same-document fragment (`#id`), and any `url(...)`/`@import`/`http(s):` reference inside
 * `<style>` or `style=""` that is not a fragment. `<style>` itself is allowed — diagrams exported
 * from tools like Archify carry their palette as scoped CSS custom properties.
 */

/** Refuse anything larger than this; a plan is meant to be shared, not to ship a poster. */
export const SVG_MAX_BYTES = 2 * 1024 * 1024

const REFUSED_ELEMENTS = new Set([
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'image',
  'audio',
  'video',
])
const REF_ATTRS = new Set(['href', 'xlink:href', 'src', 'data'])

interface JsxAttribute {
  type: string
  name?: string
  value?: unknown
  position?: { start: { offset?: number; line: number; column: number }; end: { offset?: number } }
}

interface JsxNode {
  type: string
  name?: string | null
  attributes?: JsxAttribute[]
  position?: { start: { offset?: number; line: number; column: number }; end: { offset?: number } }
}

interface HastNode {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  value?: string
  children?: HastNode[]
}

export interface InlineResult {
  /** The plan source with each resolvable `<Svg src>` rewritten to carry `svg="…"`; unresolvable
   * tags carry `error="…"` instead so the runtime shows the reason in place. */
  source: string
  /** One issue per `<Svg>` that could not be inlined, positioned at the tag. */
  issues: CheckIssue[]
}

/** Why an SVG file was refused, or null when it is acceptable to inline. */
export function svgRefusalReason(markup: string): string | null {
  const trimmed = markup.trim()
  if (!/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(trimmed)) {
    return 'not an SVG document (must start with <svg)'
  }
  const root = fromHtml(trimmed, { fragment: true, space: 'svg' }) as HastNode
  const svgRoots = (root.children ?? []).filter(c => c.type === 'element' && c.tagName === 'svg')
  if (svgRoots.length !== 1) return `expected exactly one root <svg>, found ${svgRoots.length}`

  let reason: string | null = null
  const walk = (node: HastNode): void => {
    if (reason) return
    if (node.type === 'element' && node.tagName) {
      const tag = node.tagName.toLowerCase()
      if (REFUSED_ELEMENTS.has(tag)) {
        reason = `contains <${node.tagName}>`
        return
      }
      for (const [rawName, rawValue] of Object.entries(node.properties ?? {})) {
        const name = rawName.toLowerCase()
        const value = Array.isArray(rawValue) ? rawValue.join(' ') : String(rawValue ?? '')
        if (/^on[a-z]/.test(name)) {
          reason = `contains an event handler attribute (${rawName})`
          return
        }
        // hast camel-cases xlink:href to xLinkHref; normalise both spellings.
        const isRef = REF_ATTRS.has(name) || name === 'xlinkhref'
        if (isRef && value && !value.startsWith('#')) {
          reason = `references an external resource in ${rawName}="${value.slice(0, 60)}"`
          return
        }
        if (name === 'style' && !cssIsLocal(value)) {
          reason = `style attribute references an external resource`
          return
        }
      }
      if (tag === 'style') {
        const css = (node.children ?? []).map(c => c.value ?? '').join('')
        if (!cssIsLocal(css)) {
          reason = '<style> references an external resource (@import, url(...) or http(s):)'
          return
        }
      }
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(root)
  return reason
}

/** CSS is local when every url() points at a same-document fragment and nothing imports or fetches. */
function cssIsLocal(css: string): boolean {
  if (/@import/i.test(css)) return false
  if (/https?:\/\//i.test(css) || /\bdata:/i.test(css)) return false
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi)) {
    if (!(m[2] ?? '').trim().startsWith('#')) return false
  }
  return true
}

/** Escape SVG markup for a double-quoted MDX/JSX string attribute (entities are decoded by MDX). */
function escapeAttribute(markup: string): string {
  return markup
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

async function loadSvg(path: string): Promise<{ markup?: string; error?: string }> {
  if (extname(path).toLowerCase() !== '.svg') return { error: `not an .svg file: ${path}` }
  let size: number
  try {
    size = (await stat(path)).size
  } catch {
    return { error: `file not found: ${path}` }
  }
  if (size > SVG_MAX_BYTES) {
    return { error: `file is ${size} bytes; the limit is ${SVG_MAX_BYTES} (2 MB)` }
  }
  const markup = (await readFile(path, 'utf8')).replace(/^﻿/, '')
  const refusal = svgRefusalReason(markup)
  if (refusal) return { error: `refused: ${refusal}` }
  return { markup: markup.trim() }
}

/**
 * Inline every `<Svg src="…">` in `source`, resolving `src` against `baseDir` (the plan file's
 * directory; the cwd for stdin/API input). Never throws: an unresolvable tag is reported as an
 * issue and rewritten to carry `error="…"`, and a source with no `<Svg>` is returned untouched.
 */
export async function inlineSvgIncludes(source: string, baseDir: string): Promise<InlineResult> {
  if (!/<Svg[\s/>]/.test(source)) return { source, issues: [] }
  const tree = unified()
    .use(remarkParse)
    .use(remarkFrontmatter)
    .use(remarkGfm)
    .use(remarkMdx)
    .parse(source)

  const edits: Array<{ at: number; insert: string }> = []
  const issues: CheckIssue[] = []
  const pending: Array<Promise<void>> = []

  visit(tree, node => {
    const el = node as JsxNode
    if ((el.type !== 'mdxJsxFlowElement' && el.type !== 'mdxJsxTextElement') || el.name !== 'Svg')
      return
    const at = el.position?.start ?? { line: 1, column: 1 }
    const attrs = el.attributes ?? []
    // Already inlined (a re-run over an inlined source, e.g. share after render): leave it alone.
    if (attrs.some(a => a.type === 'mdxJsxAttribute' && (a.name === 'svg' || a.name === 'error')))
      return
    const srcAttr = attrs.find(a => a.type === 'mdxJsxAttribute' && a.name === 'src')
    // Insert right after `<Svg` (offset of the tag start + 4) so later attributes keep their columns
    // as far as possible and a multi-line tag stays valid.
    const insertAt = (el.position?.start.offset ?? 0) + '<Svg'.length
    if (!srcAttr || typeof srcAttr.value !== 'string' || !srcAttr.value.trim()) {
      const message = '<Svg> needs a src="…" string attribute (a path relative to the plan file)'
      issues.push({ line: at.line, column: at.column, message })
      edits.push({ at: insertAt, insert: ` error="${escapeAttribute(message)}"` })
      return
    }
    const src = srcAttr.value.trim()
    const path = isAbsolute(src) ? src : resolve(baseDir, src)
    pending.push(
      loadSvg(path).then(({ markup, error }) => {
        if (markup !== undefined) {
          edits.push({ at: insertAt, insert: ` svg="${escapeAttribute(markup)}"` })
        } else {
          const message = `<Svg src="${src}">: ${error}`
          issues.push({ line: at.line, column: at.column, message })
          edits.push({ at: insertAt, insert: ` error="${escapeAttribute(message)}"` })
        }
      }),
    )
  })
  await Promise.all(pending)

  // Apply from the end so earlier offsets stay valid.
  edits.sort((a, b) => b.at - a.at)
  let out = source
  for (const { at, insert } of edits) out = out.slice(0, at) + insert + out.slice(at)
  issues.sort((a, b) => a.line - b.line || a.column - b.column)
  return { source: out, issues }
}

/** The directory `<Svg src>` paths resolve against for a plan read from `file` (cwd for stdin). */
export function svgBaseDir(file: string | undefined, fromStdin: boolean): string {
  if (fromStdin || !file || file === '-') return process.cwd()
  return dirname(resolve(file))
}
