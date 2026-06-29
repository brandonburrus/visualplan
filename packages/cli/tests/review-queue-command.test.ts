// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Feedback } from '@visualplan/core'
import { type ReviewQueueDeps, runReviewQueue } from '../src/commands/review.js'

/** Capture writes to a stream-like sink. */
function sink(): { write: (s: string) => void; text: () => string } {
  let buf = ''
  return { write: (s: string) => (buf += s), text: () => buf }
}

const prevExit = process.exitCode

afterEach(() => {
  process.exitCode = prevExit
})

/** Deps that read fixed sources, enqueue to fake ids, and resolve fixed verdicts after a delay. */
function deps(
  verdicts: Record<string, { feedback: Feedback; delayMs: number }>,
  out: { write: (s: string) => void },
  opts: { shellConnected?: boolean; opened?: { count: number } } = {},
): ReviewQueueDeps {
  let n = 0
  return {
    readSource: async (file: string) => `# ${file}\n\nbody\n`,
    check: async () => [],
    ensureDaemon: async () => ({ port: 1234 }),
    enqueue: async () => {
      n += 1
      return { id: `p${n}`, shellConnected: opts.shellConnected ?? false }
    },
    awaitVerdict: async (_port: number, id: string) => {
      const v = verdicts[id]
      await new Promise(r => setTimeout(r, v.delayMs))
      return v.feedback
    },
    openBrowser: async () => {
      if (opts.opened) opts.opened.count += 1
    },
    stdout: out as NodeJS.WriteStream,
  }
}

describe('runReviewQueue', () => {
  it('streams each verdict the instant it resolves, prefixed by its file (golden)', async () => {
    const out = sink()
    // b resolves before a, so b's block must appear first despite a being enqueued first.
    const d = deps(
      {
        p1: { feedback: { decision: 'approve', comments: [], answers: [] }, delayMs: 200 },
        p2: { feedback: { decision: 'iterate', comments: [], answers: [] }, delayMs: 20 },
      },
      out,
    )
    await runReviewQueue(['a.mdx', 'b.mdx'], {}, d)
    const text = out.text()
    expect(text).toContain('a.mdx')
    expect(text).toContain('b.mdx')
    expect(text).toContain('DECISION: approve')
    expect(text).toContain('DECISION: iterate')
    // b.mdx (faster) streamed before a.mdx.
    expect(text.indexOf('b.mdx')).toBeLessThan(text.indexOf('a.mdx'))
  })

  it('exits 0 when all plans are approved and 1 otherwise (golden + error)', async () => {
    const allApproved = deps(
      {
        p1: { feedback: { decision: 'approve', comments: [], answers: [] }, delayMs: 0 },
        p2: { feedback: { decision: 'approve', comments: [], answers: [] }, delayMs: 0 },
      },
      sink(),
    )
    process.exitCode = 0
    await runReviewQueue(['a.mdx', 'b.mdx'], {}, allApproved)
    expect(process.exitCode ?? 0).toBe(0)

    const oneDenied = deps(
      {
        p1: { feedback: { decision: 'approve', comments: [], answers: [] }, delayMs: 0 },
        p2: { feedback: { decision: 'deny', comments: [], answers: [] }, delayMs: 0 },
      },
      sink(),
    )
    await runReviewQueue(['a.mdx', 'b.mdx'], {}, oneDenied)
    expect(process.exitCode).toBe(1)
  })

  it('emits one JSON object keyed by file with --json (edge)', async () => {
    const out = sink()
    const d = deps(
      {
        p1: { feedback: { decision: 'approve', comments: [], answers: [] }, delayMs: 0 },
        p2: { feedback: { decision: 'deny', comments: [], answers: [], note: 'no' }, delayMs: 0 },
      },
      out,
    )
    await runReviewQueue(['a.mdx', 'b.mdx'], { json: true }, d)
    const parsed = JSON.parse(out.text())
    expect(parsed['a.mdx'].decision).toBe('approve')
    expect(parsed['b.mdx'].decision).toBe('deny')
    expect(parsed['b.mdx'].note).toBe('no')
  })

  it('opens the browser only when no shell is connected (edge)', async () => {
    const opened = { count: 0 }
    const noShell = deps(
      { p1: { feedback: { decision: 'approve', comments: [], answers: [] }, delayMs: 0 } },
      sink(),
      { shellConnected: false, opened },
    )
    await runReviewQueue(['a.mdx'], {}, noShell)
    expect(opened.count).toBe(1)

    const opened2 = { count: 0 }
    const withShell = deps(
      { p1: { feedback: { decision: 'approve', comments: [], answers: [] }, delayMs: 0 } },
      sink(),
      { shellConnected: true, opened: opened2 },
    )
    await runReviewQueue(['a.mdx'], {}, withShell)
    expect(opened2.count).toBe(0)
  })

  it('reports check issues and exits 1 without enqueuing a bad plan (error)', async () => {
    const out = sink()
    const enqueue = vi.fn()
    const d: ReviewQueueDeps = {
      ...deps({}, out),
      check: async () => [{ line: 1, column: 1, message: 'bad', severity: 'error' }],
      enqueue: enqueue as never,
    }
    await runReviewQueue(['a.mdx'], {}, d)
    expect(process.exitCode).toBe(1)
    expect(enqueue).not.toHaveBeenCalled()
  })
})
