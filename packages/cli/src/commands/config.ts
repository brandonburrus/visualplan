import {
  type Config,
  type Theme,
  THEMES,
  configDir,
  configFilePath,
  readConfig,
  writeConfig,
} from '../config.js'

/** The settable config keys. `theme` is the only one today. */
const KEYS = ['theme'] as const
type Key = (typeof KEYS)[number]

function assertKey(key: string): asserts key is Key {
  if (!(KEYS as readonly string[]).includes(key)) {
    throw new Error(`Unknown config key "${key}". Valid keys: ${KEYS.join(', ')}`)
  }
}

/** `vplan config` — print the current settings and where they live. */
export async function runConfigShow(dir: string = configDir): Promise<void> {
  const config = await readConfig(dir)
  const lines = [`Config: ${configFilePath(dir)}`, '', `  theme = ${config.theme}`]
  process.stdout.write(`${lines.join('\n')}\n`)
}

/** `vplan config get <key>` — print a single setting's value. */
export async function runConfigGet(key: string, dir: string = configDir): Promise<void> {
  assertKey(key)
  const config = await readConfig(dir)
  process.stdout.write(`${config[key]}\n`)
}

/** `vplan config set <key> <value>` — validate, persist, and confirm. */
export async function runConfigSet(
  key: string,
  value: string,
  dir: string = configDir,
): Promise<void> {
  assertKey(key)
  // `theme` is the only key, so its value rules are the only ones to enforce.
  if (!(THEMES as readonly string[]).includes(value)) {
    throw new Error(`Invalid theme "${value}". Valid values: ${THEMES.join(' | ')}`)
  }
  const next: Config = { ...(await readConfig(dir)), theme: value as Theme }
  await writeConfig(next, dir)
  process.stdout.write(`Set ${key} = ${value}\n`)
}

/** `vplan config path` — print the config file path. */
export function runConfigPath(dir: string = configDir): void {
  process.stdout.write(`${configFilePath(dir)}\n`)
}
