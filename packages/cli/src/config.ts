/**
 * The persistent CLI config, stored at `~/.vplan/config.json`. The only setting today is the
 * default `theme` (`light` | `dark` | `system`), which the render path bakes into a rendered plan
 * as its initial scheme. A rendered plan's in-page cog overrides this per-view via `localStorage`;
 * it never writes here. The file is changed by the `vplan config set` command (or by hand).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type Theme = 'light' | 'dark' | 'system'

export interface Config {
  theme: Theme
}

/** The valid `theme` values, in menu order. */
export const THEMES: readonly Theme[] = ['light', 'dark', 'system']
const DEFAULT_CONFIG: Config = { theme: 'system' }

/** `~/.vplan` — the config directory. */
export const configDir = join(homedir(), '.vplan')

/** Path to the config file within `dir` (defaults to the real `~/.vplan`). */
export function configFilePath(dir: string = configDir): string {
  return join(dir, 'config.json')
}

function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

/**
 * Read the persisted config. Returns defaults when the file is missing or malformed (an absent or
 * hand-broken config must never break a render), and ignores an unknown `theme` value. `dir`
 * overrides the config directory for tests; production calls it with the default `~/.vplan`.
 */
export async function readConfig(dir: string = configDir): Promise<Config> {
  try {
    const parsed: unknown = JSON.parse(await readFile(configFilePath(dir), 'utf8'))
    const theme = (parsed as { theme?: unknown } | null)?.theme
    return { theme: isTheme(theme) ? theme : DEFAULT_CONFIG.theme }
  } catch {
    return DEFAULT_CONFIG
  }
}

/**
 * Write the config to `~/.vplan/config.json`, creating the directory if needed. Used by the
 * `vplan config set` command; the render path only reads.
 */
export async function writeConfig(config: Config, dir: string = configDir): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(configFilePath(dir), `${JSON.stringify(config, null, 2)}\n`)
}
