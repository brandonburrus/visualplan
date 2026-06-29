import ms from 'ms'
import {
  type Config,
  type Theme,
  THEMES,
  configDir,
  configFilePath,
  readConfig,
  writeConfig,
} from '../config.js'

/** The settable config keys. */
const KEYS = ['theme', 'daemonTimeout'] as const
type Key = (typeof KEYS)[number]

function assertKey(key: string): asserts key is Key {
  if (!(KEYS as readonly string[]).includes(key)) {
    throw new Error(`Unknown config key "${key}". Valid keys: ${KEYS.join(', ')}`)
  }
}

/** Parse a `daemonTimeout` value (a duration like `15m`, or a bare ms count) to a positive integer
 * of milliseconds, throwing on anything unparseable or non-positive. */
function parseDaemonTimeout(value: string): number {
  // ms's typed overload only accepts its template literal type, but at runtime it parses any string
  // (a bare number is read as milliseconds) and returns undefined for an unparseable one.
  const millis = (ms as (input: string) => number | undefined)(value)
  if (typeof millis !== 'number' || !Number.isInteger(millis) || millis <= 0) {
    throw new Error(
      `Invalid daemonTimeout "${value}". Use a positive duration like 15m, 30s, or 1h.`,
    )
  }
  return millis
}

/** `vplan config` — print the current settings and where they live. */
export async function runConfigShow(dir: string = configDir): Promise<void> {
  const config = await readConfig(dir)
  const lines = [
    `Config: ${configFilePath(dir)}`,
    '',
    `  theme = ${config.theme}`,
    `  daemonTimeout = ${config.daemonTimeout}`,
  ]
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
  const current = await readConfig(dir)
  let next: Config
  let stored: string
  switch (key) {
    case 'theme': {
      if (!(THEMES as readonly string[]).includes(value)) {
        throw new Error(`Invalid theme "${value}". Valid values: ${THEMES.join(' | ')}`)
      }
      next = { ...current, theme: value as Theme }
      stored = value
      break
    }
    case 'daemonTimeout': {
      const millis = parseDaemonTimeout(value)
      next = { ...current, daemonTimeout: millis }
      stored = String(millis)
      break
    }
  }
  await writeConfig(next, dir)
  process.stdout.write(`Set ${key} = ${stored}\n`)
}

/** `vplan config path` — print the config file path. */
export function runConfigPath(dir: string = configDir): void {
  process.stdout.write(`${configFilePath(dir)}\n`)
}
