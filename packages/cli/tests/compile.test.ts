// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildHtml, planTitle, renderToFile } from '../src/build/compile.js'

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

describe('content-aware bundling', () => {
  // The two heaviest renderers and their dep subtrees dominate the single-file output: a mermaid
  // diagram pulls in beautiful-mermaid + elkjs (a ~1.5MB layout engine, the `elk.algorithm` marker),
  // a chart pulls in recharts (~450KB, the `recharts-` class-prefix marker). buildHtml stubs the ones
  // the plan does not author, so a plan ships only what it uses. These guards pin that: a regression to
  // statically requiring either renderer would re-inflate the bundle and trip the absence assertions.
  const ELK_MARKER = 'elk.algorithm'
  const RECHARTS_MARKER = 'recharts-'

  it('drops both heavy renderers from a plan that uses neither (golden)', async () => {
    const html = await buildHtml(
      '# Plain\n\nJust prose.\n\n<Phase title="A">\n\nwork\n\n</Phase>\n',
    )
    expect(html).toContain('vp-phase')
    expect(html).not.toContain(ELK_MARKER)
    expect(html).not.toContain(RECHARTS_MARKER)
    // A renderer-free plan is a fraction of the full ~2.3MB bundle; the ceiling catches a regression
    // to statically bundling elkjs/recharts without flaking on minor dependency size drift.
    expect(html.length).toBeLessThan(1_000_000)
  }, 60_000)

  it('keeps recharts but drops elkjs for a chart-only plan (edge)', async () => {
    const html = await buildHtml(
      "# Chart\n\n<Chart type='bar' title='Effort'>\n- Limiter: 2\n- Flag: 1\n</Chart>\n",
    )
    expect(html).toContain(RECHARTS_MARKER)
    expect(html).not.toContain(ELK_MARKER)
  }, 60_000)

  it('keeps elkjs but drops recharts for a diagram-only plan (edge)', async () => {
    const html = await buildHtml('# Diagram\n\n```mermaid\nflowchart LR\n  A --> B\n```\n')
    expect(html).toContain(ELK_MARKER)
    expect(html).not.toContain(RECHARTS_MARKER)
  }, 60_000)

  it('keeps both renderers for the full example that uses both (golden)', () => {
    // The example render in beforeAll authors both a chart and a mermaid diagram, so neither is stubbed.
    expect(html).toContain(ELK_MARKER)
    expect(html).toContain(RECHARTS_MARKER)
  })
})

describe('planTitle', () => {
  it('reads the first H1 as the title (golden)', async () => {
    const path = join(workDir, 'titled.mdx')
    await writeFile(path, '# My Plan\n\nbody\n')
    expect(planTitle(path)).toBe('My Plan')
  })

  it('falls back to "Plan" when there is no H1 (edge)', async () => {
    const path = join(workDir, 'untitled.mdx')
    await writeFile(path, 'just prose, no heading\n')
    expect(planTitle(path)).toBe('Plan')
  })

  it('reads the title past a leading UTF-8 BOM (edge)', async () => {
    // A BOM before the "# " would defeat the ^#  match and silently fall back to "Plan".
    const path = join(workDir, 'bom.mdx')
    await writeFile(path, '\ufeff# BOM Plan\n\nbody\n')
    expect(planTitle(path)).toBe('BOM Plan')
  })
})

describe('theme config injection', () => {
  it('injects __VP_CONFIG__ and a data-theme bootstrap, defaulting to system (golden)', () => {
    // The example render above uses the default theme (system).
    expect(html).toContain('__VP_CONFIG__')
    expect(html).toContain('"theme":"system"')
    expect(html).toContain('document.documentElement.dataset.theme')
  })

  it('bakes a configured theme into the bootstrap default (golden)', async () => {
    const dark = await buildHtml('# t\n\nbody\n', { theme: 'dark' })
    expect(dark).toContain('"theme":"dark"')
    // Unlocked by default, so the resolver still reads the localStorage override per-view.
    expect(dark).toContain('localStorage.getItem("vp-theme")')
  }, 60_000)
})
