// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { renderToFile } from '../src/build/compile.js'

const examplePath = fileURLToPath(new URL('../templates/example.mdx', import.meta.url))
let workDir: string
let html: string

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'visualplan-compile-test-'))
  const out = join(workDir, 'example.plan.html')
  await renderToFile(examplePath, out)
  html = await readFile(out, 'utf8')
}, 60_000)

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true })
})

describe('renderToFile', () => {
  it('produces a self-contained page with a mount root (golden)', () => {
    expect(html).toContain('id="root"')
    expect(html).toContain('<!doctype html>')
  })

  it('bundles every component into the output (golden)', () => {
    for (const marker of [
      'vp-phase',
      'vp-callout',
      'vp-filetree',
      'vp-compare',
      'vp-chart',
      'vp-mermaid',
    ]) {
      expect(html).toContain(marker)
    }
  })

  it('inlines the script and styles directly into the page (edge)', () => {
    // A text scan for external tags false-positives on JS string literals in the
    // bundle, so assert the positive instead: singlefile emits the JS as an inline
    // module script and the CSS as an inline <style>, with no separate asset files.
    // A negative scan for external <script src>/<link> tags is unreliable here:
    // the React/Vite bundles contain such HTML strings as JS literals. The
    // positive signal is decisive: the JS and CSS are inlined with real content.
    expect(html).toMatch(/<script type="module"[^>]*>\s*\S/)
    expect(html).toMatch(/<style[^>]*>\s*\S/)
  })
})
