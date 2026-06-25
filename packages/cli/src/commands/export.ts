import { basename, dirname, extname, join, resolve } from 'node:path'
import { InvalidArgumentError } from 'commander'
import open from 'open'
import { captureToFile, type ExportFormat } from '../build/capture.js'
import { checkSource } from '../build/check.js'
import { buildHtml } from '../build/compile.js'
import { readConfig, type Theme, THEMES } from '../config.js'
import { printIssues } from './check.js'
import { readPlanSource } from './input.js'

export interface ExportOptions {
  /** Output path; defaults to `<file>.<pdf|jpg>` beside the input. Required for stdin input. */
  out?: string
  /** Override the config theme baked into the export (`light` | `dark` | `system`). */
  theme?: Theme
  /** Open the exported file when done. `--no-open` sets this false. Default true. */
  open?: boolean
  /** Explicit Chromium binary to render with (overrides discovery and `VPLAN_CHROMIUM`). */
  browser?: string
}

/** Validate the `<format>` positional as `pdf` or `jpg` (accepting `jpeg` as an alias of `jpg`).
 * Commander renders the thrown `InvalidArgumentError` as a usage error listing the valid values. */
export function parseExportFormat(value: string): ExportFormat {
  const normalized = value.toLowerCase()
  if (normalized === 'pdf') return 'pdf'
  if (normalized === 'jpg' || normalized === 'jpeg') return 'jpg'
  throw new InvalidArgumentError('format must be pdf or jpg')
}

/** Validate the `--theme` value against the known themes. */
export function parseTheme(value: string): Theme {
  if ((THEMES as readonly string[]).includes(value)) return value as Theme
  throw new InvalidArgumentError(`theme must be one of: ${THEMES.join(', ')}`)
}

/** Default export path: the input file's stem with the format extension, beside the input. Plain
 * `plan.pdf` / `plan.jpg` (not `.plan.pdf`), per the approved plan. */
export function defaultExportPath(absMdx: string, format: ExportFormat): string {
  const stem = basename(absMdx, extname(absMdx))
  return join(dirname(absMdx), `${stem}.${format}`)
}

/**
 * `vplan export <pdf|jpg> [file]` — validate the plan, build the self-contained page, then render it
 * to a PDF or JPG via a headless Chromium. Input is a file, `-`, or piped stdin (stdin needs
 * `--out`, having no path to derive a default from). The theme is the config default unless
 * `--theme` overrides it; the export bakes a locked theme and no share button (a static artifact).
 */
export async function runExport(
  format: ExportFormat,
  file: string | undefined,
  options: ExportOptions,
): Promise<void> {
  const { source, label, fromStdin } = await readPlanSource(file)

  const issues = await checkSource(source)
  if (issues.length > 0) {
    printIssues(label, issues)
    process.exitCode = 1
    return
  }

  if (fromStdin && !options.out) {
    throw new Error('Reading a plan from stdin needs --out to know where to write the export.')
  }
  const out = options.out
    ? resolve(options.out)
    : defaultExportPath(resolve(file as string), format)

  const theme = options.theme ?? (await readConfig()).theme
  const html = await buildHtml(source, { theme, lockTheme: true, enableSharing: false })
  await captureToFile(html, format, out, options.browser)

  process.stdout.write(`Exported ${out}\n`)
  if (options.open !== false) await open(out)
}
