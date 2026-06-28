/**
 * `vplan review <files...>` — enqueue several plans into the shared Review Queue daemon at once and
 * stream each plan's verdict to stdout the instant it resolves, prefixed by a header naming the
 * file. Exits 0 iff every plan was approved, else 1 (a deny, iterate, or tab-close Deny on any plan
 * blocks). `--json` instead collects all verdicts and prints one object keyed by file path at the
 * end. The daemon is started/reused via `ensureDaemon`; the browser opens only if no shell tab is
 * already connected.
 *
 * The orchestration takes injectable `deps` so the streaming/exit-code logic is unit-tested without
 * a real daemon, build, or browser; `index.ts` wires the real implementations.
 */
import { basename, dirname, resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { Feedback } from '@visualplan/core'
import type { CheckIssue } from '../build/check.js'
import { checkSource } from '../build/check.js'
import { readConfig } from '../config.js'
import { awaitVerdict, type EnqueueResponse, enqueuePlan } from '../review/client.js'
import { ensureDaemon } from '../review/ensure-daemon.js'
import { resolvePlanFile, printIssues } from './check.js'
import { formatFeedback } from '../review/format.js'
import open from 'open'

export interface ReviewQueueOptions {
  /** Emit one JSON object keyed by file path instead of streaming text blocks. */
  json?: boolean
  /** Do not open a browser even when no shell is connected. */
  open?: boolean
}

/** Injectable collaborators so the orchestration is testable in isolation. */
export interface ReviewQueueDeps {
  readSource: (file: string) => Promise<string>
  check: (source: string) => Promise<CheckIssue[]>
  ensureDaemon: () => Promise<{ port: number }>
  enqueue: (port: number, source: string, file: string) => Promise<EnqueueResponse>
  awaitVerdict: (port: number, id: string) => Promise<Feedback>
  openBrowser: (port: number) => Promise<void>
  stdout: NodeJS.WriteStream
}

export async function runReviewQueue(
  files: string[],
  options: ReviewQueueOptions,
  deps: ReviewQueueDeps,
): Promise<void> {
  // Read and check every plan up front; a single bad plan fails the whole run without enqueuing.
  const sources: Array<{ file: string; source: string }> = []
  for (const file of files) {
    const source = await deps.readSource(file)
    const issues = await deps.check(source)
    if (issues.length > 0) {
      printIssues(file, issues)
      process.exitCode = 1
      return
    }
    sources.push({ file, source })
  }

  const { port } = await deps.ensureDaemon()

  // Enqueue all plans; open the browser once iff no shell tab was already connected for any enqueue.
  const enqueued: Array<{ file: string; id: string }> = []
  let anyShellConnected = false
  for (const { file, source } of sources) {
    const { id, shellConnected } = await deps.enqueue(port, source, file)
    anyShellConnected = anyShellConnected || shellConnected
    enqueued.push({ file, id })
  }
  if (!anyShellConnected && options.open !== false) await deps.openBrowser(port)

  const collected: Record<string, Feedback> = {}
  let allApproved = true

  // Await each verdict concurrently; in streaming mode write each block the moment it resolves.
  await Promise.all(
    enqueued.map(async ({ file, id }) => {
      const feedback = await deps.awaitVerdict(port, id)
      collected[file] = feedback
      if (feedback.decision !== 'approve') allApproved = false
      if (!options.json) {
        deps.stdout.write(`=== ${file} ===\n${formatFeedback(feedback)}\n\n`)
      }
    }),
  )

  if (options.json) {
    deps.stdout.write(`${JSON.stringify(collected, null, 2)}\n`)
  }

  process.exitCode = allApproved ? 0 : 1
}

/** The default `dir` for a plan file: the basename of its directory (shown beside the title in the
 * queue so plans from different projects stay distinguishable). */
function planDir(file: string): string {
  return basename(dirname(resolve(file)))
}

/** Wire the real collaborators and run the queue review for the given files. */
export async function runReview(files: string[], options: ReviewQueueOptions): Promise<void> {
  const { theme, daemonTimeout } = await readConfig()
  const deps: ReviewQueueDeps = {
    readSource: async (file: string) =>
      (await readFile(resolvePlanFile(file), 'utf8')).replace(/^﻿/, ''),
    check: checkSource,
    ensureDaemon: () => ensureDaemon({ idleMs: daemonTimeout }),
    enqueue: (port, source, file) =>
      enqueuePlan(port, { source, theme, dir: planDir(file), key: resolve(file) }),
    awaitVerdict: (port, id) => awaitVerdict(port, id),
    openBrowser: async (port: number) => {
      await open(`http://localhost:${port}/`)
    },
    stdout: process.stdout,
  }
  await runReviewQueue(files, options, deps)
}
