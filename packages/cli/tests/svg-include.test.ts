// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkPlan, checkSource } from '../src/build/check.js'
import { buildHtml } from '../src/build/compile.js'
import { SVG_MAX_BYTES, inlineSvgIncludes, svgRefusalReason } from '../src/build/svg-include.js'
import { renderPlan, checkPlan as apiCheckPlan } from '../src/api.js'
import { readPlanSource } from '../src/commands/input.js'

let workDir: string

/** A tool-exported SVG shape: a scoped <style> with light/dark custom properties, defs + a local
 * marker reference, and quotes/ampersands that must survive the attribute round-trip. */
const GOOD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120" role="img" class="archify-embed">
<style>.archify-embed{--stroke:#3b82f6}:root[data-theme="dark"] .archify-embed{--stroke:#93c5fd}.archify-embed .box{fill:none;stroke:var(--stroke)}</style>
<title>ok &amp; fine</title>
<defs><marker id="a" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="var(--stroke)"/></marker></defs>
<rect class="box" x="10" y="20" width="160" height="60" rx="8"/>
<path d="M170 50 H230" stroke="var(--stroke)" marker-end="url(#a)"/>
<text x="90" y="55">controller "A"</text>
</svg>`

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'visualplan-svg-test-'))
  await mkdir(join(workDir, 'diagrams'))
  await writeFile(join(workDir, 'diagrams', 'ok.svg'), GOOD_SVG, 'utf8')
})

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true })
})

async function writePlan(name: string, body: string): Promise<string> {
  const path = join(workDir, name)
  await writeFile(path, body, 'utf8')
  return path
}

describe('svgRefusalReason (the allow-list sanitizer)', () => {
  it('accepts a static tool-exported SVG with a scoped <style> and local url(#) refs (golden)', () => {
    expect(svgRefusalReason(GOOD_SVG)).toBeNull()
  })

  it.each([
    [
      '<script>',
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      /<script>/,
    ],
    [
      '<foreignObject>',
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div/></foreignObject></svg>',
      /foreignObject/i,
    ],
    [
      'event handler',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="x()"/></svg>',
      /event handler/,
    ],
    [
      'external xlink:href',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="https://evil/x.svg#a"/></svg>',
      /external resource/,
    ],
    [
      'external href',
      '<svg xmlns="http://www.w3.org/2000/svg"><a href="https://evil"><rect/></a></svg>',
      /external resource/,
    ],
    [
      '@import in <style>',
      '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://x/y.css);</style></svg>',
      /<style> references/,
    ],
    [
      'url(http) in <style>',
      '<svg xmlns="http://www.w3.org/2000/svg"><style>.a{fill:url(https://x/p.png)}</style></svg>',
      /<style> references/,
    ],
    [
      'url(http) in style=""',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(https://x/p.png)"/></svg>',
      /style attribute/,
    ],
    ['<image>', '<svg xmlns="http://www.w3.org/2000/svg"><image href="#x"/></svg>', /<image>/],
    ['not an svg', '<div>hello</div>', /not an SVG/],
    [
      'two roots',
      '<svg xmlns="http://www.w3.org/2000/svg"></svg><svg xmlns="http://www.w3.org/2000/svg"></svg>',
      /exactly one root/,
    ],
  ])('refuses %s (error)', (_label, markup, pattern) => {
    expect(svgRefusalReason(markup)).toMatch(pattern)
  })
})

describe('inlineSvgIncludes', () => {
  it('rewrites <Svg src> to carry the file markup as an entity-escaped string attribute (golden)', async () => {
    const source = '# T\n\n<Svg src="./diagrams/ok.svg" title="Link" caption="c" />\n'
    const { source: out, issues } = await inlineSvgIncludes(source, workDir)
    expect(issues).toEqual([])
    expect(out).toMatch(/^# T\n\n<Svg svg="/)
    // The original attributes survive after the inserted one.
    expect(out).toContain('src="./diagrams/ok.svg" title="Link" caption="c" />')
    // Quotes and ampersands are escaped so the attribute stays a plain MDX string.
    expect(out).toContain('&quot;archify-embed&quot;')
    expect(out).toContain('ok &amp;amp; fine')
    // And MDX decodes them back: the compiled plan carries the real markup.
    const issuesAfter = await checkSource(out)
    expect(issuesAfter).toEqual([])
  })

  it('leaves a source with no <Svg> untouched (edge)', async () => {
    const source = '# T\n\nplain\n'
    expect(await inlineSvgIncludes(source, workDir)).toEqual({ source, issues: [] })
  })

  it('is idempotent over an already-inlined source (edge)', async () => {
    const once = await inlineSvgIncludes('<Svg src="./diagrams/ok.svg" />\n', workDir)
    const twice = await inlineSvgIncludes(once.source, workDir)
    expect(twice.source).toBe(once.source)
  })

  it('reports a missing file at the tag position and marks the tag with error="…" (error)', async () => {
    const source = '# T\n\ntext\n\n<Svg src="./diagrams/nope.svg" />\n'
    const { source: out, issues } = await inlineSvgIncludes(source, workDir)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ line: 5, column: 1 })
    expect(issues[0]?.message).toMatch(/file not found/)
    expect(out).toMatch(/<Svg error="[^"]*file not found[^"]*" src="\.\/diagrams\/nope\.svg" \/>/)
  })

  it('refuses a file over the size cap without reading it into the plan (error)', async () => {
    const big = `<svg xmlns="http://www.w3.org/2000/svg"><!--${'a'.repeat(SVG_MAX_BYTES)}--></svg>`
    await writeFile(join(workDir, 'diagrams', 'big.svg'), big, 'utf8')
    const { source: out, issues } = await inlineSvgIncludes(
      '<Svg src="./diagrams/big.svg" />\n',
      workDir,
    )
    expect(issues[0]?.message).toMatch(/limit is/)
    expect(out.length).toBeLessThan(1000)
  })

  it('requires src (error)', async () => {
    const { issues } = await inlineSvgIncludes('<Svg title="x" />\n', workDir)
    expect(issues[0]?.message).toMatch(/needs a src/)
  })

  it('resolves src relative to baseDir, not the cwd (edge)', async () => {
    const { issues } = await inlineSvgIncludes(
      '<Svg src="./diagrams/ok.svg" />\n',
      '/nonexistent-base',
    )
    expect(issues[0]?.message).toMatch(/file not found: \/nonexistent-base\/diagrams\/ok\.svg/)
  })
})

describe('check / render integration', () => {
  it('checkPlan(path) inlines against the plan directory and passes a valid <Svg> (golden)', async () => {
    const path = await writePlan(
      'good.mdx',
      '# T\n\n<Svg src="./diagrams/ok.svg" title="Link" />\n',
    )
    expect(await checkPlan(path)).toEqual([])
  })

  it('checkPlan(path) reports each refused/missing <Svg> as file:line:col (error)', async () => {
    await writeFile(
      join(workDir, 'diagrams', 'script.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>',
      'utf8',
    )
    const path = await writePlan(
      'bad.mdx',
      '# T\n\n<Svg src="./diagrams/script.svg" />\n\n<Svg src="./diagrams/missing.svg" />\n\n<Svg src="./diagrams/ok.svg" />\n',
    )
    const issues = await checkPlan(path)
    expect(issues.map(i => [i.line, i.column])).toEqual([
      [3, 1],
      [5, 1],
    ])
    expect(issues[0]?.message).toMatch(/refused: contains <script>/)
    expect(issues[1]?.message).toMatch(/file not found/)
  })

  it('checkSource on a never-inlined <Svg src> reports it instead of rendering a blank figure (error)', async () => {
    const issues = await checkSource('<Svg src="./x.svg" />\n')
    expect(issues[0]?.message).toMatch(/was not inlined/)
  })

  it('readPlanSource inlines for a file, so every command sees a self-contained plan (golden)', async () => {
    const path = await writePlan('input.mdx', '<Svg src="./diagrams/ok.svg" />\n')
    const { source } = await readPlanSource(path)
    expect(source).toMatch(/^<Svg svg="/)
  })

  it('the rendered HTML carries the SVG markup, its <style>, and the accessible name (golden)', async () => {
    const path = await writePlan(
      'render.mdx',
      '# T\n\n<Svg src="./diagrams/ok.svg" title="Controller to panel" caption="ribbon" />\n',
    )
    const { source } = await readPlanSource(path)
    const html = await buildHtml(source, { theme: 'system' })
    // The plan renders client-side, so the markup lives in the bundle as a string; the decoded
    // (not double-escaped) form must be present exactly once, with its scoped style intact.
    expect(html).toContain('archify-embed{--stroke:#3b82f6}')
    expect(html).toContain('Controller to panel')
    expect(html).toContain('ribbon')
    expect(html).not.toContain('&quot;archify-embed&quot;')
  }, 60_000)

  it('the API renders with baseDir and refuses without one (golden/error)', async () => {
    const source = '# T\n\n<Svg src="./diagrams/ok.svg" title="x" />\n'
    expect(await apiCheckPlan(source, { baseDir: workDir })).toEqual([])
    const withoutBase = await apiCheckPlan(source, { baseDir: '/nonexistent-base' })
    expect(withoutBase[0]?.message).toMatch(/file not found/)
    const html = await renderPlan(source, { baseDir: workDir })
    expect(html).toContain('archify-embed{--stroke:#3b82f6}')
  }, 60_000)
})
