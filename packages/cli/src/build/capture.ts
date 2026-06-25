import { existsSync, readdirSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { type Browser, chromium, type Page } from 'playwright-core'

/** The two formats `vplan export` produces. `jpg` captures a full-page screenshot, `pdf` prints. */
export type ExportFormat = 'pdf' | 'jpg'

/** JPEG quality for a `jpg` export (0-100). High enough to keep diagrams/text crisp, low enough to
 * keep the file reasonable. */
const JPEG_QUALITY = 90

/** Max wait (ms) for client-rendered charts to paint before capturing; on timeout we capture
 * whatever rendered rather than fail, so a chart selector drift degrades to a possibly-blank chart
 * instead of a hard error. */
const CHART_SETTLE_TIMEOUT_MS = 5000

/**
 * Styles applied to every export. Hides interactive chrome that has no meaning in a static artifact:
 * the theme cog, the share button, and the diagram/chart expand buttons.
 */
const COMMON_EXPORT_CSS = `
.vp-theme, .vp-share, .vp-expand-btn { display: none !important; }
`

/**
 * PDF-only styles. `break-inside: avoid` keeps every self-contained block whole rather than split
 * across a page break (a chart, diagram, or card sliced by the page edge reads as broken). It is
 * applied to all block components EXCEPT `.vp-phase`: a phase is the one container that can be taller
 * than a page, where forcing it whole makes Chromium clip the overflow (content lost), so a phase
 * must flow and break between its children. The individual blocks inside it are each kept whole. A
 * single block taller than a page (a huge diagram) is the rare exception that would still clip; the
 * skill steers authors away from those. The Questions card's blue glow (a `box-shadow`) prints as a
 * muddy box, so it is removed for print only (the JPG keeps it).
 */
const PDF_EXPORT_CSS = `
.vp-compare, .vp-stat, .vp-chart, .vp-mermaid, .vp-math, .vp-callout,
.vp-matrix-wrap, .vp-questions, .vp-checklist, .vp-filetree { break-inside: avoid; }
.vp-questions { box-shadow: none !important; }
`

/**
 * Find a Playwright-managed Chromium binary in the standard per-OS browsers cache, full builds and
 * the headless shell alike. Mirrors the resolution the review e2e test uses; returns an explicit
 * path so a browser-build version skew with `playwright-core` does not block the launch. Null when
 * none is installed (the caller then guides the user to install one).
 */
function findInstalledChromium(): string | null {
  const root =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    (process.platform === 'darwin'
      ? join(homedir(), 'Library/Caches/ms-playwright')
      : process.platform === 'win32'
        ? join(homedir(), 'AppData/Local/ms-playwright')
        : join(homedir(), '.cache/ms-playwright'))
  if (!existsSync(root)) return null
  const dirs = readdirSync(root).filter(
    d => d.startsWith('chromium-') || d.startsWith('chromium_headless_shell-'),
  )
  for (const dir of dirs) {
    const candidates = [
      join(root, dir, 'chrome-mac', 'Chromium.app/Contents/MacOS/Chromium'),
      join(root, dir, 'chrome-mac-arm64', 'Chromium.app/Contents/MacOS/Chromium'),
      join(root, dir, 'chrome-linux', 'chrome'),
      join(root, dir, 'chrome-win', 'chrome.exe'),
      join(root, dir, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
      join(root, dir, 'chrome-headless-shell-mac-x64', 'chrome-headless-shell'),
      join(root, dir, 'chrome-headless-shell-linux', 'chrome-headless-shell'),
      join(root, dir, 'chrome-headless-shell-win', 'chrome-headless-shell.exe'),
    ]
    const found = candidates.find(existsSync)
    if (found) return found
  }
  return null
}

/**
 * Launch a headless Chromium, system-first: an explicit override (the `--browser` flag or
 * `VPLAN_CHROMIUM`) wins, then a system Chrome/Edge install (Playwright resolves the per-OS path
 * from the channel), then a Playwright-managed Chromium in the cache. Throws an actionable error
 * naming `npx playwright install chromium` when nothing resolves, so a missing browser never fails
 * cryptically.
 */
async function launchBrowser(override?: string): Promise<Browser> {
  const explicit = override ?? process.env.VPLAN_CHROMIUM
  if (explicit) return chromium.launch({ executablePath: explicit })

  for (const channel of ['chrome', 'msedge'] as const) {
    try {
      return await chromium.launch({ channel })
    } catch {
      // No such system browser; fall through to the next channel, then the managed cache.
    }
  }

  const installed = findInstalledChromium()
  if (installed) return chromium.launch({ executablePath: installed })

  throw new Error(
    'No Chromium found to export with. Install one with:\n  npx playwright install chromium\n' +
      'or point vplan at an existing Chrome/Chromium binary via --browser <path> or VPLAN_CHROMIUM.',
  )
}

/**
 * Wait for recharts charts to paint. A `ResponsiveContainer` emits no SVG until it has measured its
 * width, so a capture taken at `networkidle` can catch a blank chart; we wait until every `.vp-chart`
 * holds a `recharts-surface`. Animations are already disabled in the runtime, so once the surface
 * exists the chart is final. No-op when the plan has no charts. Best-effort: a timeout captures
 * whatever rendered rather than failing the export.
 */
async function waitForChartsSettled(page: Page): Promise<void> {
  // String predicates run in the page; the CLI tsconfig has no DOM lib, so a function body
  // referencing `document` would not type-check, and adding DOM here would wrongly expose browser
  // globals to the rest of the Node CLI.
  const hasCharts = await page.evaluate("document.querySelector('.vp-chart') !== null")
  if (!hasCharts) return
  await page
    .waitForFunction(
      "Array.from(document.querySelectorAll('.vp-chart')).every(c => c.querySelector('svg.recharts-surface'))",
      undefined,
      { timeout: CHART_SETTLE_TIMEOUT_MS },
    )
    .catch(() => {})
}

/**
 * Render a self-contained plan HTML string to a PDF or JPG at `outPath`. Writes the HTML to a temp
 * file and loads it as `file://` so every inlined asset resolves exactly as a real open does, waits
 * for client-rendered charts, then prints (PDF, paginated, backgrounds on) or screenshots (JPG, full
 * page, hi-dpi). `browserOverride` forces a specific Chromium binary.
 */
export async function captureToFile(
  html: string,
  format: ExportFormat,
  outPath: string,
  browserOverride?: string,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'visualplan-export-'))
  const htmlPath = join(dir, 'plan.html')
  await writeFile(htmlPath, html)

  const browser = await launchBrowser(browserOverride)
  try {
    // For PDF, load at the A4 portrait content width (210mm = 794px at 96dpi) so recharts sizes each
    // chart to the printed page from the first render. Loading at the default wide viewport and then
    // printing at A4 reflows the column narrower, but a chart's SVG does not reliably re-measure in
    // that window, so it stays wider than the page and the right edge (end point, last axis label)
    // clips. JPG keeps a wide viewport so the centered column reaches its 860px max-width before the
    // `.vp-shell` clip. deviceScaleFactor renders the JPG at 2x (ignored by page.pdf).
    const viewport = format === 'pdf' ? { width: 794, height: 1123 } : { width: 1280, height: 1024 }
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' })
    await page.addStyleTag({ content: COMMON_EXPORT_CSS })
    if (format === 'pdf') await page.addStyleTag({ content: PDF_EXPORT_CSS })
    await waitForChartsSettled(page)

    if (format === 'pdf') {
      // Top/bottom margins keep content off the sheet edges across page breaks (without them, content
      // butts the top of each new page). Left/right stay 0 so the plan column is not squeezed; its
      // own layout padding is the side gutter.
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0.5in', right: '0', bottom: '0.5in', left: '0' },
      })
      await writeFile(outPath, pdf)
    } else {
      // Clip to the plan column, not the full viewport: a fullPage shot captures the wide empty
      // margins on either side of the centered, max-width column. The shell's own padding is the
      // gutter, so the JPG is the plan with no surrounding whitespace.
      const jpg = await page
        .locator('.vp-shell')
        .screenshot({ type: 'jpeg', quality: JPEG_QUALITY })
      await writeFile(outPath, jpg)
    }
  } finally {
    await browser.close()
    await rm(dir, { recursive: true, force: true })
  }
}
