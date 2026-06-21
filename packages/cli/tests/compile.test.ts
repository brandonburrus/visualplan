// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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

  it('embeds the inline SVG favicon, surviving the single-file build (edge)', () => {
    // The favicon is a data: URI in the runtime index.html so the page stays self-contained
    // (no external asset request). transformIndexHtml must not drop it.
    expect(html).toMatch(/rel="icon"[^>]*data:image\/svg\+xml/)
  })

  it('bundles every component into the output (golden)', () => {
    for (const marker of [
      'vp-phase',
      'vp-callout',
      'vp-filetree',
      'vp-compare',
      'vp-matrix',
      'vp-chart',
      'vp-mermaid',
      'vp-math',
    ]) {
      expect(html).toContain(marker)
    }
  })

  it('sets the page <title> from the plan H1 (golden)', () => {
    expect(html).toContain('<title>Add rate limiting to the API</title>')
  })

  it('highlights code via Expressive Code with a file title (golden)', () => {
    // the build runs rehype-expressive-code; the ```ts block has title="...rate-limiter.ts"
    expect(html).toContain('expressive-code')
    expect(html).toContain('src/gateway/rate-limiter.ts')
  })

  it('adds a file-type icon to a titled code block via the file-icons plugin (golden)', () => {
    // our file-icons plugin inlines a Material file-type SVG into the title bar (no external
    // asset), tagged with our iconClass so theme.css can size it. The ```ts block carries a title.
    expect(html).toContain('vp-file-icon')
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

  it('renders a CSS color swatch via the color-chips plugin (golden)', async () => {
    // pluginColorChips inlines a preview swatch (class ec-css-color-chip) next to each CSS
    // color value. The example plan has no colors, so render a focused fixture.
    const colorDir = await mkdtemp(join(tmpdir(), 'visualplan-colorchips-'))
    try {
      const planPath = join(colorDir, 'colors.mdx')
      await writeFile(planPath, '# Colors\n\n```css\na { color: #ff0000; }\n```\n')
      const out = join(colorDir, 'colors.plan.html')
      await renderToFile(planPath, out)
      const colorHtml = await readFile(out, 'utf8')
      expect(colorHtml).toContain('ec-css-color-chip')
    } finally {
      await rm(colorDir, { recursive: true, force: true })
    }
  }, 60_000)

  it('renders a plan that lives outside any node project (edge)', async () => {
    // The plan .mdx is an external absolute path, so @mdx-js/rollup's emitted
    // react/jsx-runtime and @mdx-js/react imports must resolve from the CLI, not
    // from the plan's own (node_modules-free) directory. A bare temp dir proves
    // the resolve aliases work; without them this throws "failed to resolve".
    const bareDir = await mkdtemp(join(tmpdir(), 'visualplan-bare-plan-'))
    try {
      const planPath = join(bareDir, 'plan.mdx')
      await writeFile(planPath, '# Bare plan\n\nNo node_modules anywhere near this file.\n')
      const out = join(bareDir, 'plan.plan.html')
      // The assertion is that this does not throw: a missing react/jsx-runtime alias
      // makes renderToFile reject during the Vite build. The plan content is in the
      // client-rendered bundle (string literals), not the static DOM, so check for the
      // self-contained shell plus the plan title text embedded in the bundle.
      await renderToFile(planPath, out)
      const bareHtml = await readFile(out, 'utf8')
      expect(bareHtml).toContain('<!doctype html>')
      expect(bareHtml).toContain('Bare plan')
    } finally {
      await rm(bareDir, { recursive: true, force: true })
    }
  }, 60_000)
})
