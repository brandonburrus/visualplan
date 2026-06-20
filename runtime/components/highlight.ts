import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import go from 'highlight.js/lib/languages/go'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import type { LanguageFn } from 'highlight.js'

// A practical subset registered once. Each language declares its own aliases
// (e.g. ts, js, py, sh, yml), so `ts` and `bash` resolve without extra mapping.
const LANGUAGES: Record<string, LanguageFn> = {
  bash,
  css,
  diff,
  go,
  javascript,
  json,
  markdown,
  python,
  rust,
  sql,
  typescript,
  xml,
  yaml,
}

let registered = false

function ensureRegistered() {
  if (registered) return
  for (const [name, language] of Object.entries(LANGUAGES)) {
    hljs.registerLanguage(name, language)
  }
  registered = true
}

export interface Highlighted {
  html: string
  language: string
}

/**
 * Highlight a fenced code block to HTML using highlight.js, or return null when
 * the language is unknown (the caller renders a plain block). Synchronous and
 * DOM-free, so highlighting is present in the static/SSR output, not added later.
 */
export function highlightCode(code: string, language: string): Highlighted | null {
  ensureRegistered()
  const resolved = hljs.getLanguage(language)
  if (!resolved) return null
  const result = hljs.highlight(code, { language })
  return { html: result.value, language: resolved.name ?? language }
}
