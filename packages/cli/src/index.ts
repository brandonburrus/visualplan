import { Command } from 'commander'
import packageJson from '../package.json' with { type: 'json' }
import { DEFAULT_DEV_PORT } from './build/compile.js'
import { runCheck } from './commands/check.js'
import { runComponents } from './commands/components.js'
import { runConfigGet, runConfigPath, runConfigSet, runConfigShow } from './commands/config.js'
import { type ExportOptions, parseExportFormat, parseTheme, runExport } from './commands/export.js'
import type { ExportFormat } from './build/capture.js'
import {
  DEFAULT_REVIEW_TIMEOUT_MS,
  parseIteration,
  parsePort,
  parseTimeout,
  runRender,
  type RenderOptions,
} from './commands/render.js'
import { type ReviewQueueOptions, runReview } from './commands/review.js'
import { runReviewDaemon } from './commands/review-daemon.js'
import { runShare } from './commands/share.js'

const program = new Command('vplan')
  .description("Render an AI agent's plans as visual MDX pages instead of walls of text")
  .version(packageJson.version)

program
  .command('render', { isDefault: true })
  .description('Review a plan .mdx interactively (default), or render it to a static page')
  .argument('[file]', 'the plan .mdx file; - or omit to read from stdin')
  .option('--static', 'render a static HTML page and open it, instead of the review session')
  .option('--watch', 'start a hot-reloading dev server instead of writing a file')
  .option('--port <number>', 'port for the --watch dev server', parsePort, DEFAULT_DEV_PORT)
  .option('--out <path>', 'output HTML path (defaults to <file>.plan.html; implies --static)')
  .option('--stdout', 'write the rendered HTML to stdout instead of a file (implies --static)')
  .option(
    '--review',
    'open the interactive review session (now the default; kept for compatibility)',
  )
  .option(
    '-i, --iteration <number>',
    'plan revision number shown in the review bar',
    parseIteration,
  )
  .option(
    '--timeout <duration>',
    'max wait for review feedback, e.g. 15m, 30s, 1h',
    parseTimeout,
    DEFAULT_REVIEW_TIMEOUT_MS,
  )
  .option(
    '--diff <path>',
    'diff this render against a baseline plan .mdx (overrides the snapshot cache)',
  )
  .option('--no-diff', 'skip iteration diffing (do not read or write the snapshot cache)')
  .option('--no-daemon', 'review without the shared Review Queue daemon (one-shot server)')
  .option('--no-open', 'do not open the result in a browser')
  .action((file: string | undefined, options: RenderOptions) => runRender(file, options))

program
  .command('review')
  .description('Queue one or more plans for review in the shared Review Queue and print verdicts')
  .argument('<files...>', 'the plan .mdx files to review')
  .option('--json', 'print one JSON object keyed by file path instead of streaming text')
  .option('--no-open', 'do not open the queue in a browser')
  .action((files: string[], options: ReviewQueueOptions) => runReview(files, options))

interface ReviewDaemonCliOptions {
  port: number
  idle: number
}

// Hidden: the detached daemon process `ensureDaemon` spawns. Not for direct human use.
program
  .command('__review-daemon', { hidden: true })
  .description('internal: run the Review Queue daemon process')
  .option('--port <number>', 'port to bind', parsePort, 9151)
  .option('--idle <ms>', 'idle TTL in milliseconds', value => Number.parseInt(value, 10), 900_000)
  .action((options: ReviewDaemonCliOptions) =>
    runReviewDaemon({ port: options.port, idleMs: options.idle }),
  )

program
  .command('export')
  .description('Render a plan to a PDF or JPG (headless via Chromium)')
  .argument('<format>', 'pdf or jpg', parseExportFormat)
  .argument('[file]', 'the plan .mdx file; - or omit to read from stdin')
  .option('--out <path>', 'output path (defaults to <file>.<pdf|jpg>; required for stdin)')
  .option('--theme <theme>', 'override the baked theme: light | dark | system', parseTheme)
  .option('--browser <path>', 'Chromium binary to render with (else auto-discovered)')
  .option('--no-open', 'do not open the exported file')
  .action((format: ExportFormat, file: string | undefined, options: ExportOptions) =>
    runExport(format, file, options),
  )

program
  .command('share')
  .description('Print a shareable visualplan.dev/view link for a plan')
  .argument('[file]', 'the plan .mdx file; - or omit to read from stdin')
  .action((file: string | undefined) => runShare(file))

program
  .command('check')
  .description('Validate a plan .mdx (compile + component checks) without rendering')
  .argument('<file>', 'the plan .mdx file to validate')
  .action((file: string) => runCheck(file))

program
  .command('components')
  .description('Print the available plan components and their props')
  .action(() => runComponents())

const config = program
  .command('config')
  .description('View or change persistent settings (stored in ~/.vplan/config.json)')
  .action(() => runConfigShow())

config
  .command('get')
  .description('Print a setting (theme, daemonTimeout)')
  .argument('<key>', 'the setting to read')
  .action((key: string) => runConfigGet(key))

config
  .command('set')
  .description('Change a setting and persist it')
  .argument('<key>', 'the setting to change (theme, daemonTimeout)')
  .argument('<value>', 'the new value (theme: light | dark | system; daemonTimeout: 15m, 30s, 1h)')
  .action((key: string, value: string) => runConfigSet(key, value))

config
  .command('path')
  .description('Print the config file path')
  .action(() => runConfigPath())

program.parseAsync(process.argv).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
