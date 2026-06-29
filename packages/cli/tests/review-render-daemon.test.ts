// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import type { Feedback } from '@visualplan/core'
import { type DaemonReviewDeps, runReviewViaDaemon } from '../src/commands/render.js'

const prevExit = process.exitCode
afterEach(() => {
  process.exitCode = prevExit
})

function sink(): { write: (s: string) => void; text: () => string } {
  let buf = ''
  return { write: (s: string) => (buf += s), text: () => buf }
}

function deps(
  feedback: Feedback,
  opts: {
    delayMs?: number
    shellConnected?: boolean
    opened?: { count: number }
    out?: { write: (s: string) => void }
  } = {},
): DaemonReviewDeps {
  return {
    ensureDaemon: async () => ({ port: 1234 }),
    enqueue: async () => ({ id: 'p1', shellConnected: opts.shellConnected ?? false }),
    awaitVerdict: async (_port, _id, signal) =>
      new Promise<Feedback>((resolve, reject) => {
        const t = setTimeout(() => resolve(feedback), opts.delayMs ?? 0)
        signal?.addEventListener('abort', () => {
          clearTimeout(t)
          reject(new Error('aborted'))
        })
      }),
    openBrowser: async () => {
      if (opts.opened) opts.opened.count += 1
    },
    stdout: (opts.out ?? sink()) as NodeJS.WriteStream,
  }
}

describe('runReviewViaDaemon', () => {
  it('prints the feedback and sets the exit code from the decision (golden)', async () => {
    const out = sink()
    await runReviewViaDaemon(
      '# P\n\nx\n',
      'proj',
      {},
      deps({ decision: 'iterate', comments: [], answers: [] }, { out }),
    )
    expect(out.text()).toContain('DECISION: iterate')
    expect(process.exitCode).toBe(2)
  })

  it('times out with exit code 3 when the verdict does not arrive in time (error)', async () => {
    await runReviewViaDaemon(
      '# P\n\nx\n',
      'proj',
      { timeout: 80 },
      deps({ decision: 'approve', comments: [], answers: [] }, { delayMs: 5000 }),
    )
    expect(process.exitCode).toBe(3)
  })

  it('opens the browser only when no shell is connected (edge)', async () => {
    const opened = { count: 0 }
    await runReviewViaDaemon(
      '# P\n\nx\n',
      'proj',
      {},
      deps({ decision: 'approve', comments: [], answers: [] }, { shellConnected: true, opened }),
    )
    expect(opened.count).toBe(0)

    const opened2 = { count: 0 }
    await runReviewViaDaemon(
      '# P\n\nx\n',
      'proj',
      {},
      deps(
        { decision: 'approve', comments: [], answers: [] },
        { shellConnected: false, opened: opened2 },
      ),
    )
    expect(opened2.count).toBe(1)
  })
})
