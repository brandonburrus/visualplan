import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { InvalidArgumentError } from 'commander'
import ms from 'ms'
import open from 'open'
import { checkPlan, checkSource } from '../build/check.js'
import { buildHtml, startDevServer } from '../build/compile.js'
import { readSnapshot, writeSnapshot } from '../build/snapshots.js'
import { readConfig } from '../config.js'
import { runReview } from '../review/session.js'
import { printIssues, resolvePlanFile } from './check.js'
import { readPlanSource } from './input.js'

/** Default `--review` timeout: 15 minutes. A review waits on a human, so the window is generous. */
export const DEFAULT_REVIEW_TIMEOUT_MS = 15 * 60 * 1000

export interface RenderOptions {
  watch?: boolean
  out?: string
  open?: boolean
  /** Write the rendered HTML to stdout instead of a file (suppresses the browser open). */
  stdout?: boolean
  /** Port for the `--watch` dev server; ignored for a one-shot file render. */
  port?: number
  /** Open the plan as an interactive review session and print the reviewer's feedback. */
  review?: boolean
  /** Max wait (ms) for review feedback before timing out; parsed from a duration by `parseTimeout`. */
  timeout?: number
  /** Iteration number shown in the review bar (the agent sets it as it revises the plan). */
  iteration?: number
  /** Diff baseline. A string path is an explicit baseline (bypasses the cache); `false` is
   * `--no-diff` (disable diffing); `undefined` auto-diffs a file render against its snapshot. */
  diff?: string | false
}

/**
 * Resolve the diff baseline for a render and refresh the snapshot cache. Explicit `--diff <path>`
 * wins and does not touch the cache; `--no-diff` (`diff === false`) disables diffing entirely;
 * otherwise a file render auto-diffs against its path-keyed snapshot and then overwrites it with the
 * current source ("changes since you last looked"). Piped stdin (`absPath` undefined) has no stable
 * key, so it only diffs via an explicit `--diff`.
 */
async function resolveBaseline(
  options: RenderOptions,
  currentSource: string,
  absPath: string | undefined,
): Promise<string | undefined> {
  if (options.diff === false) return undefined
  if (typeof options.diff === 'string') {
    return (await readFile(resolve(options.diff), 'utf8')).replace(/^﻿/, '')
  }
  if (absPath === undefined) return undefined
  const baseline = await readSnapshot(absPath)
  await writeSnapshot(absPath, currentSource)
  return baseline
}

/** The absolute path that keys a plan's snapshot, or undefined for stdin (no stable key). */
function snapshotKey(file: string | undefined, fromStdin: boolean): string | undefined {
  return !fromStdin && file && file !== '-' ? resolve(file) : undefined
}

/** Parse the `--iteration` value as a positive integer (the plan revision number shown in review). */
export function parseIteration(value: string): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) {
    throw new InvalidArgumentError('iteration must be a positive integer')
  }
  return n
}

/** Parse and validate the `--port` value as a TCP port (1-65535). Commander calls this per option
 * value, throwing `InvalidArgumentError` (which it renders as a usage error) on a bad port. */
export function parsePort(value: string): number {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new InvalidArgumentError('port must be an integer between 1 and 65535')
  }
  return port
}

/** Parse the `--timeout` value (a duration like `15m`, `30s`, `1h`) to milliseconds via `ms`. */
export function parseTimeout(value: string): number {
  // ms's typed overload only accepts its `StringValue` template type, but at runtime it takes any
  // string and returns undefined for an unparseable one.
  const millis = (ms as (input: string) => number | undefined)(value)
  if (typeof millis !== 'number' || millis <= 0) {
    throw new InvalidArgumentError('timeout must be a positive duration like 15m, 30s, or 1h')
  }
  return millis
}

function defaultOutPath(absMdx: string): string {
  const stem = basename(absMdx, extname(absMdx))
  return join(dirname(absMdx), `${stem}.plan.html`)
}

/**
 * `vplan render [file]` — validate, then build a static page or start a watch server. Input comes
 * from a file, an explicit `-`, or piped stdin; output goes to a file (and opens) or to stdout.
 */
export async function runRender(file: string | undefined, options: RenderOptions): Promise<void> {
  if (options.stdout && options.out) {
    throw new Error('Pass either --stdout or --out, not both.')
  }
  if (options.stdout && options.watch) {
    throw new Error(
      '--stdout cannot be combined with --watch; the watch server has no file output.',
    )
  }
  if (options.review && (options.watch || options.stdout || options.out)) {
    throw new Error('--review cannot be combined with --watch, --stdout, or --out.')
  }

  const { theme } = await readConfig()

  // Review is a one-shot server that blocks on human feedback; it accepts a file or piped stdin
  // because it serves a snapshot read once (no watching), unlike --watch.
  if (options.review) {
    const { source, label, fromStdin } = await readPlanSource(file)
    const issues = await checkSource(source)
    if (issues.length > 0) {
      printIssues(label, issues)
      process.exitCode = 1
      return
    }
    const baseline = await resolveBaseline(options, source, snapshotKey(file, fromStdin))
    await runReview(
      source,
      theme,
      options.timeout ?? DEFAULT_REVIEW_TIMEOUT_MS,
      options.open !== false,
      options.iteration,
      baseline,
    )
    return
  }

  // The watch server hot-reloads a file on disk, so it needs a real path; stdin has nothing to re-read.
  if (options.watch) {
    if (file === undefined || file === '-') {
      throw new Error('--watch needs a plan file; it cannot watch stdin.')
    }
    const absMdx = resolvePlanFile(file)
    const issues = await checkPlan(absMdx)
    if (issues.length > 0) {
      printIssues(file, issues)
      process.exitCode = 1
      return
    }
    const baseline = await resolveBaseline(options, await readFile(absMdx, 'utf8'), absMdx)
    const server = await startDevServer(absMdx, theme, options.port, baseline)
    process.stdout.write(
      `Visual Plan watching ${file}\n  ${server.url}\n  (edit the file to hot-reload; Ctrl+C to stop)\n`,
    )
    if (options.open !== false) await open(server.url)
    return
  }

  const { source, label, fromStdin } = await readPlanSource(file)
  const issues = await checkSource(source)
  if (issues.length > 0) {
    printIssues(label, issues)
    process.exitCode = 1
    return
  }

  // A stdout render must stay deterministic (CI / pipelines), so it never auto-diffs against the
  // home-dir snapshot cache; only an explicit --diff applies. A file render auto-diffs as usual.
  const goingToStdout = options.stdout || (fromStdin && !options.out)
  const baseline = await resolveBaseline(
    options,
    source,
    goingToStdout ? undefined : snapshotKey(file, fromStdin),
  )
  const html = await buildHtml(source, { theme, baseline })

  // Piped stdin with no explicit destination defaults to stdout, so the tool composes in a pipeline.
  if (goingToStdout) {
    process.stdout.write(html)
    return
  }

  // Not stdout, so there is a file destination: --out, or the default beside a file input.
  const out = options.out ? resolve(options.out) : defaultOutPath(resolve(file as string))
  await writeFile(out, html)
  process.stdout.write(`Rendered ${out}\n`)
  if (options.open !== false) await open(out)
}
