// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildQueueShell } from '../src/build/queue-shell.js'

describe('buildQueueShell', () => {
  let html: string

  it('builds a self-contained shell page with a mount root (golden)', async () => {
    html = await buildQueueShell()
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('id="root"')
    expect(html).toContain('Review Queue')
  })

  it('inlines all JS and CSS so the daemon serves one string (golden)', async () => {
    html ??= await buildQueueShell()
    // A negative scan for external <script src>/<link href> is unreliable: those strings appear as
    // JS literals inside the bundle. Assert the positive instead (matching compile.test.ts): the app
    // ships as an inline module script and the CSS as an inline <style> with content.
    expect(html).toMatch(/<script type="module"[^>]*>\s*\S/)
    expect(html).toMatch(/<style[^>]*>\s*\S/)
  })

  it('does not inject any plan/virtual:plan content (edge)', async () => {
    html ??= await buildQueueShell()
    // The shell has no MDX plan, only the React shell app; the plan-only injected globals must be
    // absent so the shell never tries to mount plan content.
    expect(html).not.toContain('__VP_SHARE__')
    expect(html).not.toContain('virtual:plan')
  })
}, 60_000)
