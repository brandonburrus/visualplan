import { Command } from 'commander'
import packageJson from '../package.json' with { type: 'json' }
import { DEFAULT_DEV_PORT } from './build/compile.js'
import { runCheck } from './commands/check.js'
import { runComponents } from './commands/components.js'
import { runConfigGet, runConfigPath, runConfigSet, runConfigShow } from './commands/config.js'
import { parsePort, runRender, type RenderOptions } from './commands/render.js'

const program = new Command('vplan')
  .description("Render an AI agent's plans as visual MDX pages instead of walls of text")
  .version(packageJson.version)

program
  .command('render', { isDefault: true })
  .description('Compile a plan .mdx to a self-contained HTML page (default command)')
  .argument('<file>', 'the plan .mdx file to render')
  .option('--watch', 'start a hot-reloading dev server instead of writing a file')
  .option('--port <number>', 'port for the --watch dev server', parsePort, DEFAULT_DEV_PORT)
  .option('--out <path>', 'output HTML path (defaults to <file>.plan.html)')
  .option('--no-open', 'do not open the result in a browser')
  .action((file: string, options: RenderOptions) => runRender(file, options))

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
  .description('Print a setting (theme)')
  .argument('<key>', 'the setting to read')
  .action((key: string) => runConfigGet(key))

config
  .command('set')
  .description('Change a setting and persist it')
  .argument('<key>', 'the setting to change (theme)')
  .argument('<value>', 'the new value (theme: light | dark | system)')
  .action((key: string, value: string) => runConfigSet(key, value))

config
  .command('path')
  .description('Print the config file path')
  .action(() => runConfigPath())

program.parseAsync(process.argv).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
