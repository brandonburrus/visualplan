import { basename, dirname, extname, join, resolve } from 'node:path'
import { InvalidArgumentError } from 'commander'
import open from 'open'
import { checkPlan } from '../build/check.js'
import { renderToFile, startDevServer } from '../build/compile.js'
import { readConfig } from '../config.js'
import { printIssues, resolvePlanFile } from './check.js'

export interface RenderOptions {
  watch?: boolean
  out?: string
  open?: boolean
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

/** `vplan render <file>` — validate, then build a static page or start a watch server. */
export async function runRender(file: string, options: RenderOptions): Promise<void> {
  const absMdx = resolvePlanFile(file)

  const issues = await checkPlan(absMdx)
  if (issues.length > 0) {
    printIssues(file, issues)
    process.exitCode = 1
    return
  }

  const { theme } = await readConfig()

  if (options.watch) {
    const server = await startDevServer(absMdx, theme, options.port)
    process.stdout.write(
      `Visual Plan watching ${file}\n  ${server.url}\n  (edit the file to hot-reload; Ctrl+C to stop)\n`,
    )
    if (options.open !== false) await open(server.url)
    return
  }

  const out = options.out ? resolve(options.out) : defaultOutPath(absMdx)
  await renderToFile(absMdx, out, theme)
  process.stdout.write(`Rendered ${out}\n`)
  if (options.open !== false) await open(out)
}
