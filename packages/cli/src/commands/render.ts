import { basename, dirname, extname, join, resolve } from 'node:path'
import open from 'open'
import { checkPlan } from '../build/check.js'
import { renderToFile, startDevServer } from '../build/compile.js'
import { printIssues, resolvePlanFile } from './check.js'

export interface RenderOptions {
  watch?: boolean
  out?: string
  open?: boolean
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

  if (options.watch) {
    const server = await startDevServer(absMdx)
    process.stdout.write(
      `VisualPlan watching ${file}\n  ${server.url}\n  (edit the file to hot-reload; Ctrl+C to stop)\n`,
    )
    if (options.open !== false) await open(server.url)
    return
  }

  const out = options.out ? resolve(options.out) : defaultOutPath(absMdx)
  await renderToFile(absMdx, out)
  process.stdout.write(`Rendered ${out}\n`)
  if (options.open !== false) await open(out)
}
