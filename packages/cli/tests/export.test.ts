// @vitest-environment node
import { existsSync, readdirSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { InvalidArgumentError } from 'commander'
import { describe, expect, it } from 'vitest'
import { captureToFile } from '../src/build/capture.js'
import { buildHtml } from '../src/build/compile.js'
import { defaultExportPath, parseExportFormat, parseTheme } from '../src/commands/export.js'

describe('parseExportFormat', () => {
  it('accepts pdf and jpg (golden)', () => {
    expect(parseExportFormat('pdf')).toBe('pdf')
    expect(parseExportFormat('jpg')).toBe('jpg')
  })

  it('treats jpeg and mixed case as jpg (edge)', () => {
    expect(parseExportFormat('JPEG')).toBe('jpg')
    expect(parseExportFormat('Pdf')).toBe('pdf')
  })

  it('rejects an unknown format (error)', () => {
    expect(() => parseExportFormat('png')).toThrow(InvalidArgumentError)
  })
})

describe('parseTheme', () => {
  it('accepts a known theme (golden)', () => {
    expect(parseTheme('dark')).toBe('dark')
  })

  it('rejects an unknown theme (error)', () => {
    expect(() => parseTheme('sepia')).toThrow(InvalidArgumentError)
  })
})

describe('defaultExportPath', () => {
  it('uses the stem with the format extension beside the input (golden)', () => {
    expect(defaultExportPath('/a/b/plan.mdx', 'pdf')).toBe(join('/a/b', 'plan.pdf'))
    expect(defaultExportPath('/a/b/plan.mdx', 'jpg')).toBe(join('/a/b', 'plan.jpg'))
  })

  it('handles a name with no extension (edge)', () => {
    expect(defaultExportPath('/a/b/plan', 'pdf')).toBe(join('/a/b', 'plan.pdf'))
  })
})

/** Find an installed Playwright Chromium so the capture e2e can run; null skips it (e.g. CI without
 * a browser), mirroring the review tab-close e2e. */
function findChromium(): string | null {
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
    const found = [
      join(root, dir, 'chrome-mac-arm64', 'Chromium.app/Contents/MacOS/Chromium'),
      join(root, dir, 'chrome-mac', 'Chromium.app/Contents/MacOS/Chromium'),
      join(root, dir, 'chrome-linux', 'chrome'),
      join(root, dir, 'chrome-win', 'chrome.exe'),
      join(root, dir, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
      join(root, dir, 'chrome-headless-shell-mac-x64', 'chrome-headless-shell'),
      join(root, dir, 'chrome-headless-shell-linux', 'chrome-headless-shell'),
      join(root, dir, 'chrome-headless-shell-win', 'chrome-headless-shell.exe'),
    ].find(existsSync)
    if (found) return found
  }
  return null
}

const browserPath = findChromium()
const PLAN = '# Export e2e\n\n<Phase title="Only phase">\n- a step\n</Phase>\n'

describe.skipIf(!browserPath)('captureToFile (e2e, needs a browser)', () => {
  it('writes a non-empty PDF with a %PDF- header (golden)', async () => {
    const html = await buildHtml(PLAN, { theme: 'light' })
    const out = join(tmpdir(), `vplan-export-test-${process.pid}.pdf`)
    try {
      await captureToFile(html, 'pdf', out, browserPath as string)
      const bytes = await readFile(out)
      expect(bytes.length).toBeGreaterThan(0)
      expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    } finally {
      await rm(out, { force: true })
    }
  }, 60_000)

  it('writes a JPEG with the SOI marker (golden)', async () => {
    const html = await buildHtml(PLAN, { theme: 'light' })
    const out = join(tmpdir(), `vplan-export-test-${process.pid}.jpg`)
    try {
      await captureToFile(html, 'jpg', out, browserPath as string)
      const bytes = await readFile(out)
      expect(bytes.length).toBeGreaterThan(0)
      expect(bytes[0]).toBe(0xff)
      expect(bytes[1]).toBe(0xd8)
    } finally {
      await rm(out, { force: true })
    }
  }, 60_000)
})
