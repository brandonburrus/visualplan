// @vitest-environment node
//
// End-to-end check for the tab-close -> Deny path. A static unit test cannot cover it: the deny is
// emitted by the page's `pagehide` handler via `navigator.sendBeacon`, which only a real browser
// does. This drives a headless browser against an in-process review server and asserts the server's
// feedback promise resolves to a Deny carrying the comment made before closing.
//
// Gated on a locally installed Playwright Chromium shell; it SKIPS where none exists (e.g. CI), so
// it never fails for lack of a browser. Run it on a machine with `npx playwright install chromium`.
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { type Browser, chromium } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type ReviewServer, startReviewServer } from '../src/build/compile.js'

const PLAN = '# Tab close test\n\n<Phase title="Only phase">\n- a step\n</Phase>\n'

/** Find a locally installed Playwright chromium headless-shell binary, or null to skip. We launch by
 * explicit path so a browser-build version skew with playwright-core does not block the run. */
function findHeadlessShell(): string | null {
  const root =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    (process.platform === 'darwin'
      ? join(homedir(), 'Library/Caches/ms-playwright')
      : process.platform === 'win32'
        ? join(homedir(), 'AppData/Local/ms-playwright')
        : join(homedir(), '.cache/ms-playwright'))
  if (!existsSync(root)) return null
  for (const dir of readdirSync(root).filter(d => d.startsWith('chromium_headless_shell-'))) {
    const candidates = [
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

const executablePath = findHeadlessShell()

describe.skipIf(!executablePath)('review tab-close -> Deny (e2e)', () => {
  let browser: Browser
  let server: ReviewServer

  beforeAll(async () => {
    browser = await chromium.launch({ executablePath: executablePath as string })
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

  it('beacons a Deny on unload mid-review, carrying the comments made', async () => {
    server = await startReviewServer(PLAN)
    const page = await browser.newPage()
    // beforeunload shows a native confirm on close; auto-accept it so the unload proceeds.
    page.on('dialog', dialog => void dialog.accept().catch(() => {}))

    await page.goto(server.url, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.vp-review-bar', { timeout: 20_000 })

    // Add one comment so the test also proves the tab-close Deny carries comments, not just the
    // verdict. Wait for the draft sync to land so the server has the comment before the tab "closes".
    await page.hover('.vp-phase')
    await page.waitForSelector('.vp-review-add', { timeout: 8_000 })
    await page.click('.vp-review-add')
    await page.fill('.vp-review-composer__input', 'closing without deciding')
    const draftSynced = page.waitForResponse(
      res => res.url().endsWith('/__vp_draft') && res.request().method() === 'POST',
    )
    await page.click('.vp-review-btn--primary')
    await draftSynced

    // Navigate the document away without deciding. This drops the keepalive connection, which the
    // server detects exactly as it would a real tab close (the literal close is covered manually).
    await page.goto('about:blank', { waitUntil: 'load' })

    const feedback = await Promise.race([
      server.feedback,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('no deny beacon received before timeout')), 15_000),
      ),
    ])

    expect(feedback.decision).toBe('deny')
    expect(feedback.comments).toEqual([{ section: 'Only phase', body: 'closing without deciding' }])
  }, 60_000)
})
