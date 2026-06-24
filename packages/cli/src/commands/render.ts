import { writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { InvalidArgumentError } from 'commander'
import open from 'open'
import { checkPlan, checkSource } from '../build/check.js'
import { buildHtml, startDevServer } from '../build/compile.js'
import { readConfig } from '../config.js'
import { printIssues, resolvePlanFile } from './check.js'
import { readPlanSource } from './input.js'

export interface RenderOptions {
  watch?: boolean
  out?: string
  open?: boolean
  /** Write the rendered HTML to stdout instead of a file (suppresses the browser open). */
  stdout?: boolean
  /** Port for the `--watch` dev server; ignored for a one-shot file render. */
  port?: number
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

  const { theme } = await readConfig()

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
    const server = await startDevServer(absMdx, theme, options.port)
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

  const html = await buildHtml(source, { theme })

  // Piped stdin with no explicit destination defaults to stdout, so the tool composes in a pipeline.
  if (options.stdout || (fromStdin && !options.out)) {
    process.stdout.write(html)
    return
  }

  // Not stdout, so there is a file destination: --out, or the default beside a file input.
  const out = options.out ? resolve(options.out) : defaultOutPath(resolve(file as string))
  await writeFile(out, html)
  process.stdout.write(`Rendered ${out}\n`)
  if (options.open !== false) await open(out)
}
