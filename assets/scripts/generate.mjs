// Dev-only generator for the README marketing images (assets/example.jpg, review.jpg, queue.jpg).
// Built the same way as banner.jpg: a hand-authored dark HTML "stage" screenshotted headless at 2x.
//
// Authenticity, not mockups: every plan CARD is a real `vplan` dark render, and the review chrome
// (comment composer, Questions, decision bar) is captured from a REAL review-mode render -- the page
// is rendered normally, then the review globals are injected so the runtime mounts the actual
// ReviewLayer, which we drive (select text -> open composer, answer a question, hover Approve) and
// screenshot. So the marketing is pixels from the shipped product, with zero drift.
//
//   node assets/scripts/generate.mjs            # regenerate all three
//   node assets/scripts/generate.mjs review     # just one (example | review | queue)
//
// Requires the CLI to be built (packages/cli/dist) and a Chromium (system Chrome/Edge or a
// `npx playwright install chromium`), resolved exactly as `vplan export` does.

import { existsSync, readdirSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'
import { renderPlan } from '../../packages/cli/dist/api.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const ASSETS = join(ROOT, 'assets')
const EXAMPLES = join(ROOT, 'packages', 'app', 'examples')
const PLANS = join(HERE, 'plans')
const SCALE = 2

// ----------------------------------------------------------------------------------------------
// Chromium resolution (mirrors packages/cli/src/build/capture.ts)
// ----------------------------------------------------------------------------------------------

function findInstalledChromium() {
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
    ]
    const found = candidates.find(existsSync)
    if (found) return found
  }
  return null
}

async function launchBrowser() {
  const explicit = process.env.VPLAN_CHROMIUM
  if (explicit) return chromium.launch({ executablePath: explicit })
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel })
    } catch {
      // fall through
    }
  }
  const installed = findInstalledChromium()
  if (installed) return chromium.launch({ executablePath: installed })
  throw new Error('No Chromium found. Install one with: npx playwright install chromium')
}

// ----------------------------------------------------------------------------------------------
// Capture helpers
// ----------------------------------------------------------------------------------------------

/** Write a self-contained HTML string to a temp file and open it; runs `fn(page)` then cleans up. */
async function withPage(browser, html, viewport, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'vp-marketing-'))
  const file = join(dir, 'page.html')
  await writeFile(file, html)
  const page = await browser.newPage({ viewport, deviceScaleFactor: SCALE })
  try {
    await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle' })
    return await fn(page)
  } finally {
    await page.close()
    await rm(dir, { recursive: true, force: true })
  }
}

/** Render a plan's MDX to a dark page, screenshot the top `clipHeight` px at `width`, return a PNG
 * data URI the stages embed as a card. PNG (not JPEG) so card text stays crisp under the final pass. */
async function renderCard(browser, mdxPath, { width, clipHeight, tightTop = false }) {
  const html = await renderPlan(await readFile(mdxPath, 'utf8'), { theme: 'dark' })
  return withPage(browser, html, { width, height: clipHeight }, async page => {
    await page.addStyleTag({
      content: '.vp-theme,.vp-share,.vp-expand-btn{display:none!important}',
    })
    // Trim the shell's generous top gutter so the plan title sits near the top of the card.
    if (tightTop) await page.addStyleTag({ content: '.vp-shell{padding-top:1.25rem!important}' })
    await page.waitForTimeout(350)
    const buf = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width, height: clipHeight },
    })
    return `data:image/png;base64,${buf.toString('base64')}`
  })
}

const dataUri = buf => `data:image/png;base64,${buf.toString('base64')}`

// Removes the shell's max-width cap and padding so a component renders edge-to-edge at the viewport
// width, and stretches a mermaid SVG to fill it. Shared by the measure and capture passes.
const COMPONENT_FILL_CSS =
  '.vp-theme,.vp-share,.vp-expand-btn{display:none!important}' +
  '.vp-shell{max-width:none!important;padding:0!important}' +
  '.vp-mermaid svg{width:100%!important;height:auto!important}'

/** Render a one-component plan at `width` and return its rendered aspect ratio (w/h). Used by the
 * bento's justified layout to size each cell so a row fills the full width with no letterboxing. */
async function measureAspect(browser, mdx, selector, width) {
  const html = await renderPlan(mdx, { theme: 'dark' })
  return withPage(browser, html, { width, height: 1400 }, async page => {
    await page.addStyleTag({ content: COMPONENT_FILL_CSS })
    await page.waitForTimeout(600) // let recharts / mermaid paint
    const box = await page.locator(selector).first().boundingBox()
    return box.width / box.height
  })
}

/** Render a one-component plan at `width` and screenshot just that component (transparent). */
async function captureComponent(browser, mdx, selector, width) {
  const html = await renderPlan(mdx, { theme: 'dark' })
  return withPage(browser, html, { width, height: 1400 }, async page => {
    await page.addStyleTag({ content: COMPONENT_FILL_CSS })
    await page.evaluate(() => {
      document.documentElement.style.background = 'transparent'
      document.body.style.background = 'transparent'
    })
    await page.waitForTimeout(600)
    return dataUri(await page.locator(selector).first().screenshot({ omitBackground: true }))
  })
}

/** A normal render with the review globals injected (exactly what `buildHtml({ review })` does), so
 * the real ReviewLayer mounts. Demo mode keeps everything in-page (no CLI server, no beforeunload).
 * `fontPx` scales the whole page up so the captured chrome reads at README size. */
async function reviewHtml(mdxPath, fontPx) {
  const html = await renderPlan(await readFile(mdxPath, 'utf8'), { theme: 'dark' })
  const inject =
    '<script>globalThis.__VP_REVIEW__=true;globalThis.__VP_REVIEW_DEMO__=true;globalThis.__VP_REVIEW_ITERATION__=2</script>' +
    `<style>html{font-size:${fontPx}px}</style>`
  return html.replace('<head>', `<head>${inject}`)
}

/** Select a phrase inside `.vp-main` and fire the mouseup the review layer listens for, so its
 * "Comment" pill appears; runs in the page. */
function selectPhraseInPage() {
  const main = document.querySelector('.vp-main')
  const phrase = 'short-circuit with 429 when the client is over budget'
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
  let node = null
  let idx = -1
  while (walker.nextNode()) {
    const i = walker.currentNode.textContent.indexOf(phrase)
    if (i !== -1) {
      node = walker.currentNode
      idx = i
      break
    }
  }
  if (!node) return
  const range = document.createRange()
  range.setStart(node, idx)
  range.setEnd(node, idx + phrase.length)
  const sel = getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
}

const TRANSPARENT_BG = () => {
  document.documentElement.style.background = 'transparent'
  document.body.style.background = 'transparent'
}

const QUESTION_ANSWER =
  'Fail open with a loud alert: availability outranks throttling for our traffic.'
const COMMENT_BODY = 'Send a Retry-After header here so clients back off instead of hot-looping.'

/**
 * Drive a REAL review session and screenshot its live chrome, each transparent so it composites onto
 * the dark stage. `partsWidth` is the viewport the composer/Questions are captured at (narrow = the
 * components render compact and large-relative, so they stay readable in the README); the decision
 * bar is captured at the wider `barWidth` to keep its real full-width proportions.
 */
async function captureReviewParts(browser, mdxPath, { partsWidth, barWidth, fontPx = 17 }) {
  const html = await reviewHtml(mdxPath, fontPx)
  return withPage(browser, html, { width: partsWidth, height: 1400 }, async page => {
    await page.addStyleTag({
      content: '.vp-theme,.vp-share,.vp-expand-btn{display:none!important}',
    })
    await page.waitForSelector('.vp-review-bar')

    await page.fill('.vp-questions__answer', QUESTION_ANSWER)
    await page.waitForTimeout(120)
    await page.evaluate(TRANSPARENT_BG)
    const questions = dataUri(
      await page.locator('.vp-questions').screenshot({ omitBackground: true }),
    )

    // The selection -> "Comment" pill is timing-sensitive (the layer reads the live selection on
    // mouseup), so retry until the pill appears, keeping regeneration reliable.
    for (let attempt = 0; ; attempt++) {
      await page.evaluate(selectPhraseInPage)
      try {
        await page.waitForSelector('.vp-review-select', { timeout: 2000 })
        break
      } catch (err) {
        if (attempt >= 4) throw err
      }
    }
    await page.click('.vp-review-select')
    await page.waitForSelector('.vp-review-composer__input')
    await page.fill('.vp-review-composer__input', COMMENT_BODY)
    await page.waitForTimeout(120)
    await page.addStyleTag({ content: '.vp-main{visibility:hidden!important}' })
    const composer = dataUri(
      await page.locator('.vp-review-composer').screenshot({ omitBackground: true }),
    )

    // Widen the viewport so the bottom bar takes its real full-width proportions, then hover Approve.
    await page.setViewportSize({ width: barWidth, height: 1400 })
    await page.waitForTimeout(120)
    await page.hover('.vp-review-decision--approve')
    await page.waitForTimeout(120)
    const bar = dataUri(await page.locator('.vp-review-bar').screenshot({ omitBackground: true }))

    return { questions, composer, bar }
  })
}

/** Just the real decision bar at `barWidth`, Approve hovered. Used for the queue image's bottom. */
async function captureBar(browser, mdxPath, { barWidth, fontPx = 17 }) {
  const html = await reviewHtml(mdxPath, fontPx)
  return withPage(browser, html, { width: barWidth, height: 1200 }, async page => {
    await page.addStyleTag({
      content: '.vp-theme,.vp-share,.vp-expand-btn{display:none!important}',
    })
    await page.waitForSelector('.vp-review-bar')
    await page.fill('.vp-questions__answer', QUESTION_ANSWER)
    await page.evaluate(() => {
      document.documentElement.style.background = 'transparent'
      document.body.style.background = 'transparent'
      document.querySelector('.vp-main').style.visibility = 'hidden'
    })
    await page.hover('.vp-review-decision--approve')
    await page.waitForTimeout(120)
    return dataUri(await page.locator('.vp-review-bar').screenshot({ omitBackground: true }))
  })
}

/** Render a marketing stage HTML at `width`x`height` CSS px (2x device scale) and write a JPEG. */
async function shoot(browser, html, { width, height, out }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: SCALE })
  try {
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.waitForTimeout(150)
    const buf = await page.screenshot({
      type: 'jpeg',
      quality: 92,
      clip: { x: 0, y: 0, width, height },
    })
    await writeFile(out, buf)
    console.log(`wrote ${out} (${width * SCALE}x${height * SCALE})`)
  } finally {
    await page.close()
  }
}

// ----------------------------------------------------------------------------------------------
// Shared stage chrome
// ----------------------------------------------------------------------------------------------

const DARK_VARS = `
  --vp-bg:#161618; --vp-surface:#1e1e21; --vp-surface-2:#26262a; --vp-text:#e9e9e6;
  --vp-muted:#a1a1a8; --vp-faint:#74747b; --vp-border:#2b2b2f; --vp-border-strong:#3a3a3f;
  --vp-accent:#e9e9e6; --vp-on-accent:#161618; --vp-done:#45c97a; --vp-risk:#ef8f8f;
  --vp-gold:#e8c14f; --vp-question:#7aa2ff; --vp-question-tint:#161d2e; --vp-question-border:#2b3a5e;
  --vp-font:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --vp-mono:"SF Mono",ui-monospace,"JetBrains Mono",Menlo,Consolas,monospace;
`

// The brand mark: the Tabler `license` icon (the product's favicon), bare monochrome stroke, no chip.
const LICENSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 21h-9a3 3 0 0 1 -3 -3v-1h10v2a2 2 0 0 0 4 0v-14a2 2 0 1 1 2 2h-2m2 -4h-11a3 3 0 0 0 -3 3v11"/><path d="M9 7l4 0"/><path d="M9 11l4 0"/></svg>`

/** Small brand lockup used on every image (the big wordmark is reserved for banner.jpg). `posStyle`
 * overrides the default top-left placement (e.g. the queue image, whose sidebar fills the left). */
function brand(posStyle = '') {
  return `<div class="mark"${posStyle ? ` style="${posStyle}"` : ''}>
    <span class="mark__icon">${LICENSE_ICON}</span>
    <span class="mark__word">Visual Plan</span>
  </div>`
}

function shell(width, height, body, extraCss = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root{${DARK_VARS}}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0}
    body{
      width:${width}px;height:${height}px;overflow:hidden;
      font-family:var(--vp-font);color:var(--vp-text);
      background:
        radial-gradient(1200px 700px at 78% -12%, #1a1a1f 0%, rgba(26,26,31,0) 60%),
        radial-gradient(900px 600px at 6% 112%, #17171b 0%, rgba(23,23,27,0) 55%),
        #0d0d0f;
      -webkit-font-smoothing:antialiased;
    }
    .stage{position:relative;width:${width}px;height:${height}px}
    .mark{position:absolute;top:42px;left:54px;display:flex;align-items:center;gap:10px;z-index:30}
    .mark__icon{width:25px;height:25px;color:#e9e9e6;display:block}
    .mark__icon svg{width:25px;height:25px;display:block}
    .mark__word{font-size:18px;font-weight:650;letter-spacing:-.02em;color:#eaeae7}
    .headline{font-weight:650;letter-spacing:-.022em;color:#f4f4f2;line-height:1.06}
    .sub{color:#9a9aa2;font-weight:420;letter-spacing:-.005em}
    .card{position:relative;border:1px solid #2b2b2f;border-radius:12px;overflow:hidden;
      background:#161618;box-shadow:0 30px 80px -20px rgba(0,0,0,.7),0 8px 24px -8px rgba(0,0,0,.5)}
    .card img{display:block;width:100%;height:auto}
    .card::after{content:"";position:absolute;inset:0;border-radius:12px;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.05);pointer-events:none}
    ${extraCss}
  </style></head><body><div class="stage">${body}</div></body></html>`
}

// ----------------------------------------------------------------------------------------------
// Image 1: Example plan -- "MDX in, a polished plan out"
// ----------------------------------------------------------------------------------------------

/** A light, line-based MDX tinter for the editor panel: enough coloring to read as a real editor
 * without a full grammar. Decorative only. */
function tintMdx(source) {
  const C = {
    head: '#e8c14f',
    tag: '#b794f6',
    attr: '#7aa2ff',
    str: '#45c97a',
    punc: '#71717a',
    txt: '#c6c6c2',
    fence: '#38b6cf',
    pick: '#45c97a',
  }
  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const span = (c, t) => `<span style="color:${c}">${t}</span>`
  let inFence = false
  const lines = source.replace(/\n+$/, '').split('\n')
  const out = lines.map(raw => {
    const line = raw
    if (/^```/.test(line)) {
      inFence = !inFence
      return span(C.fence, esc(line))
    }
    if (inFence) return span(C.txt, esc(line) || '&nbsp;')
    if (/^#{1,3}\s/.test(line)) {
      // headings; mark a trailing (pick) green
      const m = line.match(/^(.*?)(\s*\(pick\))?$/)
      return span(C.head, esc(m[1])) + (m[2] ? span(C.pick, esc(m[2])) : '')
    }
    // component tag line: <Tag attr="v" ...> or </Tag>
    const tag = line.match(/^(\s*)(<\/?)([A-Za-z]+)(.*?)(\/?>)\s*$/)
    if (tag) {
      const [, ind, open, name, rest, close] = tag
      const attrs = rest.replace(
        /([A-Za-z-]+)(=)("[^"]*")/g,
        (_, n, eq, v) => span(C.attr, n) + span(C.punc, eq) + span(C.str, v),
      )
      return ind + span(C.punc, esc(open)) + span(C.tag, name) + attrs + span(C.punc, esc(close))
    }
    // pro:/con: bullet
    const bullet = line.match(/^(\s*-\s*)(pro:|con:)?(.*)$/)
    if (bullet) {
      const [, dash, key, txt] = bullet
      return span(C.punc, dash) + (key ? span(C.attr, key) : '') + span(C.txt, esc(txt))
    }
    return span(C.txt, esc(line) || '&nbsp;')
  })
  return out.map(l => `<div class="ln">${l}</div>`).join('')
}

function stageExample(card, source) {
  const W = 1280
  const H = 800
  const BOX = 632 // matched editor + card height
  const width = 548
  const margin = 50
  const top = 120
  const css = `
    .e-head{position:absolute;top:46px;left:0;width:100%;text-align:center;z-index:20}
    .e-head .headline{font-size:30px;font-weight:600;color:#e6e6e2}
    .panel{position:absolute;top:${top}px;width:${width}px;height:${BOX}px}
    .editor{left:${margin}px;border:1px solid #2b2b2f;border-radius:12px;overflow:hidden;background:#1a1a1d;
      box-shadow:0 30px 80px -24px rgba(0,0,0,.7)}
    .editor__bar{display:flex;align-items:center;gap:8px;padding:12px 15px;background:#202024;border-bottom:1px solid #2b2b2f}
    .dot{width:11px;height:11px;border-radius:50%}
    .editor__name{margin-left:8px;font-family:var(--vp-mono);font-size:13px;color:#8a8a90}
    .editor__body{padding:16px 20px;font-family:var(--vp-mono);font-size:13.5px;line-height:1.66;white-space:pre}
    .out{right:${margin}px}
    .out .card{height:${BOX}px}
    .arrow{position:absolute;left:${margin + width}px;right:${margin + width}px;top:${top}px;height:${BOX}px;
      display:grid;place-items:center;z-index:25}
    .arrow__disc{width:60px;height:60px;border-radius:50%;display:grid;place-items:center;
      background:linear-gradient(150deg,#26262b,#1a1a1e);border:1px solid #3a3a3f;box-shadow:0 12px 30px -8px rgba(0,0,0,.65)}
  `
  const body = `
    ${brand()}
    <div class="e-head">
      <span class="headline">MDX in, a polished plan out</span>
    </div>
    <div class="panel editor">
      <div class="editor__bar">
        <span class="dot" style="background:#ff5f57"></span>
        <span class="dot" style="background:#febc2e"></span>
        <span class="dot" style="background:#28c840"></span>
        <span class="editor__name">rate-limiting.mdx</span>
      </div>
      <div class="editor__body">${tintMdx(source)}</div>
    </div>
    <div class="arrow">
      <div class="arrow__disc">
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#e9e9e6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6l-6 6"/></svg>
      </div>
    </div>
    <div class="panel out"><div class="card"><img src="${card}"></div></div>
  `
  return { html: shell(W, H, body, css), width: W, height: H, out: join(ASSETS, 'example.jpg') }
}

// ----------------------------------------------------------------------------------------------
// Image 2: Review mode -- comment, answer, approve (real captured components)
// ----------------------------------------------------------------------------------------------

function stageReview(card, parts) {
  const W = 1280
  const H = 780
  const css = `
    .r-head{position:absolute;left:64px;top:104px;width:356px;z-index:20}
    .r-head .headline{font-size:42px}
    .r-head .sub{font-size:17px;margin-top:18px;line-height:1.55}
    /* The plan is the foreground hero (near full brightness); the live popovers float over it. */
    .r-card{position:absolute;left:486px;top:56px;width:472px;height:632px;filter:brightness(.96)}
    .r-card .card{height:100%}
    .pop{position:absolute;z-index:10;filter:drop-shadow(0 24px 50px rgba(0,0,0,.7))}
    .pop img{display:block;height:auto}
    .composer{top:150px;right:64px}
    .composer img{width:500px}
    .q{top:438px;left:64px}
    .q img{width:476px}
    .bar{position:absolute;left:0;right:0;bottom:0;z-index:14;filter:drop-shadow(0 -2px 18px rgba(0,0,0,.45))}
    .bar img{width:100%;height:auto;display:block}
  `
  const body = `
    ${brand('top:auto;left:auto;right:54px;bottom:94px')}
    <div class="r-head">
      <div class="headline">Reviewed before a line is written</div>
      <div class="sub">Comment on any section or selection, answer the plan's open questions inline, then Approve, Iterate, or Deny. The CLI blocks on your verdict.</div>
    </div>
    <div class="r-card"><div class="card"><img src="${card}"></div></div>
    <div class="pop composer"><img src="${parts.composer}"></div>
    <div class="pop q"><img src="${parts.questions}"></div>
    <div class="bar"><img src="${parts.bar}"></div>
  `
  return { html: shell(W, H, body, css), width: W, height: H, out: join(ASSETS, 'review.jpg') }
}

// ----------------------------------------------------------------------------------------------
// Image 3: Review Queue -- iterate at the speed of thought
// ----------------------------------------------------------------------------------------------

const ICON = {
  circle:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/></svg>',
  check:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3.34a10 10 0 1 1 -14.995 8.984l-.005 -.324l.005 -.324a10 10 0 0 1 14.995 -8.336zm-1.293 5.953a1 1 0 0 0 -1.32 -.083l-.094 .083l-3.293 3.292l-1.293 -1.292l-.094 -.083a1 1 0 0 0 -1.403 1.403l.083 .094l2 2l.094 .083a1 1 0 0 0 1.226 0l.094 -.083l4 -4l.083 -.094a1 1 0 0 0 -.083 -1.32z"/></svg>',
  refresh:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/></svg>',
}

function queueRow({ title, dir, state, active, version }) {
  const status =
    state === 'approve'
      ? `<span style="color:var(--vp-done)">${ICON.check}</span>`
      : state === 'iterate'
        ? `<span style="color:var(--vp-gold)">${ICON.refresh}</span>`
        : `<span style="color:var(--vp-muted)">${ICON.circle}</span>`
  return `<li><div class="qrow${active ? ' qrow--active' : ''}${state !== 'pending' ? ' qrow--done' : ''}">
    <span class="qrow__status">${status}</span>
    <span class="qrow__text">
      <span class="qrow__title">${title}</span>
      <span class="qrow__dir">${dir}</span>
    </span>
    ${version ? `<span class="qrow__chip">${version}</span>` : ''}
  </div></li>`
}

function stageQueue(cards, bar) {
  const W = 1280
  const H = 720
  const css = `
    .sidebar{position:absolute;left:0;top:0;bottom:0;width:264px;background:var(--vp-surface);
      border-right:1px solid var(--vp-border);display:flex;flex-direction:column}
    .qhead{padding:.95rem 1rem .8rem;border-bottom:1px solid var(--vp-border)}
    .qhead__title{font-size:.86rem;font-weight:600;letter-spacing:.01em}
    .qhead__count{display:block;font-size:.72rem;color:var(--vp-muted);margin-top:.18rem}
    .qlist{list-style:none;margin:0;padding:.45rem;display:flex;flex-direction:column;gap:2px}
    .qrow{display:flex;align-items:center;gap:.55rem;padding:.55rem .55rem;border:1px solid transparent;border-radius:7px}
    .qrow--active{background:color-mix(in srgb,var(--vp-accent) 9%,var(--vp-surface));border-color:var(--vp-border-strong)}
    .qrow__status{display:inline-flex;flex:none}
    .qrow__text{display:flex;flex-direction:column;gap:.1rem;min-width:0}
    .qrow__title{font-size:.8rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .qrow--done .qrow__title{color:var(--vp-muted)}
    .qrow--active .qrow__title{font-weight:600;color:var(--vp-text)}
    .qrow__dir{font-size:.68rem;color:var(--vp-muted);font-family:var(--vp-mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .qrow__chip{flex:none;margin-left:auto;padding:.05rem .32rem;border:1px solid var(--vp-border-strong);
      border-radius:5px;background:var(--vp-bg);color:var(--vp-muted);font-family:var(--vp-mono);font-size:.64rem}
    .q-head{position:absolute;left:312px;top:60px;width:440px;z-index:20}
    .q-head .headline{font-size:39px}
    .q-head .sub{font-size:17px;margin-top:14px;line-height:1.5}
    .fan{position:absolute;left:300px;right:-40px;top:232px;height:${H - 232}px}
    .fan .card{position:absolute;width:380px;height:480px}
    .fan .c1{left:120px;top:36px;transform:rotate(-3deg) scale(.96);filter:brightness(.7);z-index:1}
    .fan .c2{left:330px;top:18px;transform:rotate(2.5deg) scale(.98);filter:brightness(.82);z-index:2}
    .fan .c3{left:560px;top:0;transform:rotate(0deg);z-index:3}
    /* The active plan's real decision bar, pinned to the bottom of the plan pane (right of the rail). */
    .qbar{position:absolute;left:264px;right:0;bottom:0;z-index:20;
      filter:drop-shadow(0 -2px 18px rgba(0,0,0,.45))}
    .qbar img{width:100%;height:auto;display:block}
  `
  const rows = [
    queueRow({ title: 'Add rate limiting to the API', dir: 'api-gateway', state: 'approve' }),
    queueRow({ title: 'Zero-downtime orders migration', dir: 'orders-svc', state: 'approve' }),
    queueRow({
      title: 'Offline-first sync for mobile',
      dir: 'mobile-app',
      state: 'iterate',
      active: true,
      version: 'v2',
    }),
    queueRow({ title: 'Build the events lakehouse', dir: 'data-platform', state: 'pending' }),
    queueRow({ title: 'Halve the dashboard load time', dir: 'web-dashboard', state: 'pending' }),
    queueRow({ title: 'Add SSO with OAuth2 and OIDC', dir: 'identity', state: 'pending' }),
  ].join('')
  const body = `
    ${brand('top:42px;left:auto;right:54px')}
    <div class="sidebar">
      <div class="qhead">
        <span class="qhead__title">Plans to Review</span>
        <span class="qhead__count">2 of 6 reviewed</span>
      </div>
      <ul class="qlist">${rows}</ul>
    </div>
    <div class="q-head">
      <div class="headline">Review one after another</div>
      <div class="sub">Queue every in-progress plan into one tab and clear them back-to-back. Iterate at the speed of thought.</div>
    </div>
    <div class="fan">
      <div class="card c1"><img src="${cards[0]}"></div>
      <div class="card c2"><img src="${cards[1]}"></div>
      <div class="card c3"><img src="${cards[2]}"></div>
    </div>
    <div class="qbar"><img src="${bar}"></div>
  `
  return { html: shell(W, H, body, css), width: W, height: H, out: join(ASSETS, 'queue.jpg') }
}

// ----------------------------------------------------------------------------------------------
// Image 4: Component vocabulary -- a bento grid of real component renders
// ----------------------------------------------------------------------------------------------

// One small valid plan per component; only the component itself is captured (the `# Title` is not).
const COMPONENT_PLANS = {
  mermaid: {
    label: 'Diagram',
    selector: '.vp-mermaid',
    mdx: '# d\n\n```mermaid\nflowchart LR\n  Client --> Gateway --> Service\n  Gateway --> Cache[(Cache)]\n  Service --> DB[(Postgres)]\n```\n',
  },
  chartLine: {
    label: 'Line chart',
    selector: '.vp-chart',
    mdx: '# c\n\n<Chart type="line" title="Latency by stage (ms)">\n| Stage | p50 | p95 |\n|---|---|---|\n| Auth | 12 | 30 |\n| DB | 40 | 120 |\n| Cache | 5 | 14 |\n</Chart>\n',
  },
  chartBar: {
    label: 'Bar chart',
    selector: '.vp-chart',
    mdx: '# c\n\n<Chart type="bar" title="Effort (days)">\n- Limiter: 2\n- Dashboards: 1\n- Rollout: 1\n- Hardening: 3\n</Chart>\n',
  },
  chartGauge: {
    label: 'Gauge',
    selector: '.vp-chart',
    mdx: '# c\n\n<Chart type="gauge" title="Rollout progress">\n- Ramped: 72\n</Chart>\n',
  },
  code: {
    label: 'Code',
    selector: '.expressive-code',
    mdx: '# c\n\n```ts title="src/gateway/rate-limiter.ts"\nexport async function rateLimiter(req, res, next) {\n  const { allowed, remaining } = await slidingWindow(redis, key)\n  res.setHeader("X-RateLimit-Remaining", String(remaining))\n  if (!allowed) return res.status(429).end()\n  next()\n}\n```\n',
  },
  compare: {
    label: 'Compare',
    selector: '.vp-compare',
    mdx: '# c\n\n<Compare>\n## Redis sliding window (pick)\n- pro: accurate across all nodes\n- con: one network hop\n\n## In-memory token bucket\n- pro: zero network latency\n- con: per-node only\n</Compare>\n',
  },
  matrix: {
    label: 'Matrix',
    selector: '.vp-matrix-wrap',
    mdx: '# m\n\n<Matrix>\n| Dimension | Postgres (pick) | ClickHouse | Dynamo |\n|---|---|---|---|\n| Writes | medium | high | high |\n| Querying | high | medium | low |\n| Ops cost | low | medium | low |\n</Matrix>\n',
  },
  filetree: {
    label: 'File tree',
    selector: '.vp-filetree',
    mdx: '# f\n\n<FileTree>\n- add src/gateway/rate-limiter.ts\n- modify src/gateway/middleware.ts\n- add test/gateway/rate-limiter.test.ts\n- delete src/legacy/\n</FileTree>\n',
  },
  checklist: {
    label: 'Checklist',
    selector: '.vp-checklist',
    mdx: '# c\n\n<Checklist title="Done when">\n- [x] Returns 429 over the limit\n- [x] Retry-After header present\n- [ ] Fail-open path verified\n- [ ] Dashboard live\n</Checklist>\n',
  },
  questions: {
    label: 'Questions',
    selector: '.vp-questions',
    mdx: '# q\n\n<Questions>\n- Should the limiter fail open or fail closed if Redis is unreachable?\n- Is a per-key budget of 100 requests per minute the right default?\n</Questions>\n',
  },
  callout: {
    label: 'Callout',
    selector: '.vp-callout',
    mdx: '# c\n\n<Callout type="decision">\nServices own their data; cross-service reads go through events, never foreign keys.\n</Callout>\n',
  },
  stat: {
    label: 'Stat',
    selector: '.vp-stat',
    mdx: '# s\n\n<Stat>\n- Est. uptime: 99.9% (good)\n- RPO: 5 min (risk)\n</Stat>\n',
  },
}

// Each array is one justified row. Within a row, items keep their true aspect and share a height
// chosen so the row fills the full content width; rows differ in where items split, so there is no
// continuous gutter down the middle. Single-item rows (callout, stat) become full-width banners.
const BENTO_ROWS = [
  ['mermaid', 'chartLine'],
  ['chartBar', 'chartGauge', 'code'],
  ['compare', 'matrix'],
  ['filetree', 'checklist', 'questions'],
  ['callout', 'stat'],
]

const BENTO = { W: 1280, M: 56, GAP: 16, RGAP: 16, HP: 14, VC: 48, TOP: 150 }

/**
 * Justified bento layout. For each row: render every component at a provisional equal-split width to
 * measure its aspect, then pick a single image height for the row so the cells (image width = height
 * x aspect, plus padding) exactly fill the content width. Renders each component again at its final
 * width so it is captured crisp (no up-scaling). Returns absolutely-positioned cells and the canvas
 * height.
 */
async function buildBento(browser) {
  const { W, M, GAP, RGAP, HP, VC, TOP } = BENTO
  const contentW = W - 2 * M
  const cells = []
  let y = TOP
  for (const row of BENTO_ROWS) {
    const n = row.length
    const provisional = Math.round((contentW - (n - 1) * GAP) / n - 2 * HP)
    const items = []
    for (const key of row) {
      const spec = COMPONENT_PLANS[key]
      const aspect = await measureAspect(browser, spec.mdx, spec.selector, provisional)
      items.push({ key, label: spec.label, spec, aspect })
    }
    const sumA = items.reduce((s, it) => s + it.aspect, 0)
    // height shared by every image in the row, solved so the cells fill contentW exactly
    const imgH = (contentW - 2 * HP * n - (n - 1) * GAP) / sumA
    let x = M
    for (const it of items) {
      const imgW = Math.round(imgH * it.aspect)
      const img = await captureComponent(browser, it.spec.mdx, it.spec.selector, imgW)
      cells.push({
        x: Math.round(x),
        y: Math.round(y),
        w: imgW + 2 * HP,
        imgH: Math.round(imgH),
        label: it.label,
        img,
      })
      x += imgW + 2 * HP + GAP
    }
    y += imgH + VC + RGAP
  }
  return { cells, H: Math.round(y - RGAP + 40) }
}

function bentoCell({ x, y, w, imgH, label, img }) {
  return `<div class="cell" style="left:${x}px;top:${y}px;width:${w}px">
    <span class="cell__label">${label}</span>
    <div class="cell__body" style="height:${imgH}px"><img src="${img}"></div>
  </div>`
}

function stageBento(cells, H) {
  const W = BENTO.W
  const M = BENTO.M
  const css = `
    .b-head{position:absolute;top:46px;left:${M}px;width:760px;z-index:20}
    .b-head .headline{font-size:32px}
    .b-head .sub{font-size:16px;margin-top:9px;color:#9a9aa2;line-height:1.45}
    .cell{position:absolute;border:1px solid #26262a;border-radius:14px;background:#161618;overflow:hidden;
      padding:13px ${BENTO.HP}px;display:flex;flex-direction:column;gap:9px;
      box-shadow:0 18px 44px -22px rgba(0,0,0,.7)}
    .cell__label{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:#74747b;font-weight:600;flex:none}
    .cell__body{display:flex;align-items:center;justify-content:center}
    .cell__body img{display:block;width:100%;height:100%;object-fit:contain}
  `
  const body = `
    ${brand('top:46px;left:auto;right:54px')}
    <div class="b-head">
      <div class="headline">A component for every shape</div>
      <div class="sub">Diagrams, charts, code, comparisons, file trees, scorecards, callouts, checklists. A fixed vocabulary, always in scope, no imports.</div>
    </div>
    ${cells.map(bentoCell).join('')}
  `
  return { html: shell(W, H, body, css), width: W, height: H, out: join(ASSETS, 'components.jpg') }
}

// ----------------------------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------------------------

async function main() {
  const which = process.argv[2]
  const browser = await launchBrowser()
  try {
    if (!which || which === 'example') {
      const src = await readFile(join(PLANS, 'example.mdx'), 'utf8')
      // Render near the display width so the plan text stays at a readable size in the card.
      const card = await renderCard(browser, join(PLANS, 'example.mdx'), {
        width: 600,
        clipHeight: 692,
        tightTop: true,
      })
      const s = stageExample(card, src)
      await shoot(browser, s.html, s)
    }
    if (!which || which === 'review') {
      const card = await renderCard(browser, join(PLANS, 'review.mdx'), {
        width: 640,
        clipHeight: 970,
        tightTop: true,
      })
      const parts = await captureReviewParts(browser, join(PLANS, 'review.mdx'), {
        partsWidth: 600,
        barWidth: 1280,
      })
      const s = stageReview(card, parts)
      await shoot(browser, s.html, s)
    }
    if (!which || which === 'queue') {
      const cards = await Promise.all([
        renderCard(browser, join(EXAMPLES, 'schema-migration.mdx'), {
          width: 720,
          clipHeight: 960,
        }),
        renderCard(browser, join(EXAMPLES, 'churn-model.mdx'), { width: 720, clipHeight: 960 }),
        renderCard(browser, join(EXAMPLES, 'offline-sync.mdx'), { width: 720, clipHeight: 960 }),
      ])
      const bar = await captureBar(browser, join(PLANS, 'review.mdx'), { barWidth: 1016 })
      const s = stageQueue(cards, bar)
      await shoot(browser, s.html, s)
    }
    if (!which || which === 'components') {
      const { cells, H } = await buildBento(browser)
      const s = stageBento(cells, H)
      await shoot(browser, s.html, s)
    }
  } finally {
    await browser.close()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
