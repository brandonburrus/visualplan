import { readFile } from 'node:fs/promises'
import { resolvePlanFile } from './check.js'

/** A plan's MDX source plus a label for diagnostics (the file path, or `<stdin>`). */
export interface PlanSource {
  source: string
  /** What `check` issues are prefixed with: the file path, or `<stdin>` for piped input. */
  label: string
  fromStdin: boolean
}

const STDIN_LABEL = '<stdin>'

/** Drain `process.stdin` to a UTF-8 string. Used when the plan is piped in rather than a file. */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Resolve a plan's MDX source from a file argument or stdin, BOM-stripped. The `file` arg is read
 * as a path unless it is `-` (the explicit stdin sentinel). When no `file` is given, stdin is used
 * if it is piped; a bare invocation on an interactive terminal throws rather than hang waiting for
 * input that will never come.
 */
export async function readPlanSource(file?: string): Promise<PlanSource> {
  const useStdin = file === '-' || (file === undefined && !process.stdin.isTTY)
  if (useStdin) {
    const source = (await readStdin()).replace(/^\ufeff/, '')
    return { source, label: STDIN_LABEL, fromStdin: true }
  }
  if (file === undefined) {
    throw new Error('No input: pass a plan file or pipe MDX to stdin.')
  }
  const source = (await readFile(resolvePlanFile(file), 'utf8')).replace(/^\ufeff/, '')
  return { source, label: file, fromStdin: false }
}
