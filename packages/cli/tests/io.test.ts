// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { buildShareUrl, decodePlan } from '@visualplan/core/share'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { readPlanSource } from '../src/commands/input.js'
import { runRender } from '../src/commands/render.js'
import { runShare } from '../src/commands/share.js'

const VALID_PLAN = '# Plan\n\nSome text.\n'
const INVALID_PLAN = '# Plan\n\n<Bogus/>\n'

let workDir: string
const realStdin = Object.getOwnPropertyDescriptor(process, 'stdin')

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'visualplan-io-test-'))
})

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true })
})

afterEach(() => {
  // runShare/runRender set a non-zero exit code on the failure path; reset it so it does not leak
  // into vitest's own process exit. Also restore any stdin we faked.
  process.exitCode = 0
  if (realStdin) Object.defineProperty(process, 'stdin', realStdin)
  vi.restoreAllMocks()
})

/** Replace `process.stdin` with a finite in-memory stream so the stdin paths run in-process. */
function fakeStdin(content: string, { tty = false } = {}): void {
  const stream = Readable.from([Buffer.from(content, 'utf8')]) as Readable & { isTTY?: boolean }
  stream.isTTY = tty
  Object.defineProperty(process, 'stdin', { value: stream, configurable: true })
}

/** Capture everything written to a process stream during the callback. */
function capture(stream: 'stdout' | 'stderr') {
  const chunks: string[] = []
  vi.spyOn(process[stream], 'write').mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk))
    return true
  })
  return () => chunks.join('')
}

async function writePlan(name: string, content: string): Promise<string> {
  const path = join(workDir, name)
  await writeFile(path, content)
  return path
}

describe('readPlanSource', () => {
  it('reads a plan file (golden)', async () => {
    const path = await writePlan('read.mdx', VALID_PLAN)
    const result = await readPlanSource(path)
    expect(result).toEqual({ source: VALID_PLAN, label: path, fromStdin: false })
  })

  it('throws a friendly error for a missing file (error)', async () => {
    await expect(readPlanSource(join(workDir, 'nope.mdx'))).rejects.toThrow(/File not found/)
  })

  it('reads stdin for the explicit - sentinel (edge)', async () => {
    fakeStdin(VALID_PLAN)
    expect(await readPlanSource('-')).toEqual({
      source: VALID_PLAN,
      label: '<stdin>',
      fromStdin: true,
    })
  })

  it('auto-reads piped stdin when no file is given (edge)', async () => {
    fakeStdin(VALID_PLAN, { tty: false })
    const result = await readPlanSource(undefined)
    expect(result.fromStdin).toBe(true)
    expect(result.source).toBe(VALID_PLAN)
  })

  it('throws rather than hang when no file is given on an interactive terminal (error)', async () => {
    fakeStdin('', { tty: true })
    await expect(readPlanSource(undefined)).rejects.toThrow(/No input/)
  })
})

describe('buildShareUrl', () => {
  it('builds a view link whose payload round-trips to the source (golden)', () => {
    const url = buildShareUrl(VALID_PLAN)
    expect(url.startsWith('https://visualplan.dev/view?data=')).toBe(true)
    expect(decodePlan(url.split('data=')[1])).toBe(VALID_PLAN)
  })
})

describe('runShare', () => {
  it('prints a round-tripping view link for a valid plan (golden)', async () => {
    const path = await writePlan('share-ok.mdx', VALID_PLAN)
    const out = capture('stdout')
    await runShare(path)
    const url = out().trim()
    expect(url.startsWith('https://visualplan.dev/view?data=')).toBe(true)
    expect(decodePlan(url.split('data=')[1])).toBe(VALID_PLAN)
    expect(process.exitCode).not.toBe(1)
  })

  it('reads the plan from stdin (edge)', async () => {
    fakeStdin(VALID_PLAN)
    const out = capture('stdout')
    await runShare('-')
    expect(out().trim().startsWith('https://visualplan.dev/view?data=')).toBe(true)
  })

  it('refuses an invalid plan: issues to stderr, exit 1, no URL on stdout (error)', async () => {
    const path = await writePlan('share-bad.mdx', INVALID_PLAN)
    const out = capture('stdout')
    const err = capture('stderr')
    await runShare(path)
    expect(process.exitCode).toBe(1)
    expect(err()).toMatch(/Unknown component <Bogus>/)
    expect(out()).not.toMatch(/visualplan\.dev/)
  })
})

describe('runRender output routing', () => {
  it('writes a self-contained HTML document to stdout with --stdout (golden)', async () => {
    const path = await writePlan('render-stdout.mdx', VALID_PLAN)
    const out = capture('stdout')
    await runRender(path, { stdout: true, open: false })
    const html = out()
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('id="root"')
  }, 60_000)

  it('writes <file>.plan.html with --static (the pre-review default) (golden)', async () => {
    const path = await writePlan('render-static.mdx', VALID_PLAN)
    await runRender(path, { static: true, open: false })
    const html = await readFile(path.replace(/\.mdx$/, '.plan.html'), 'utf8')
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('id="root"')
  }, 60_000)

  it('rejects --stdout combined with --out (error)', async () => {
    const path = await writePlan('render-conflict.mdx', VALID_PLAN)
    await expect(runRender(path, { stdout: true, out: 'x.html' })).rejects.toThrow(
      /either --stdout or --out/,
    )
  })

  it('rejects --watch on stdin input (edge)', async () => {
    await expect(runRender('-', { watch: true })).rejects.toThrow(/--watch needs a plan file/)
  })
})
