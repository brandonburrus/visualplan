/**
 * The persistent CLI config, stored at `~/.vplan/config.json`: the default `theme` (`light` | `dark`
 * | `system`) baked into a rendered plan as its initial scheme, the Review Queue daemon's idle TTL,
 * and whether a rendered plan shows the share button. A rendered plan's in-page cog overrides the
 * theme per-view via `localStorage`; it never writes here. The file is changed by the
 * `vplan config set` command (or by hand).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type Theme = 'light' | 'dark' | 'system'

export interface Config {
  theme: Theme
  /**
   * Idle TTL in milliseconds that the Review Queue daemon lingers after its queue empties before
   * exiting. A re-plan during a planning session within this window reuses the warm tab instead of
   * paying a cold daemon start. Default 15 minutes. This is distinct from a single review's
   * `--timeout` (how long one caller waits for its own plan's verdict).
   */
  daemonTimeout: number
  /**
   * Whether a rendered plan shows the share button (which copies a
   * `visualplan.dev/view?data=...` link encoding the whole plan). Default `true`. A render's
   * `--no-share` flag overrides it for that invocation; the programmatic API ignores this setting
   * and controls sharing through its own `enableSharing` option.
   */
  enableSharing: boolean
}

/** The valid `theme` values, in menu order. */
export const THEMES: readonly Theme[] = ['light', 'dark', 'system']

/** Default Review Queue daemon idle TTL: 15 minutes. Unlike the review `--timeout` (default 4 hours),
 * this stays short because a cold daemon restart, unlike a human review, is cheap. */
export const DEFAULT_DAEMON_TIMEOUT_MS = 15 * 60 * 1000

const DEFAULT_CONFIG: Config = {
  theme: 'system',
  daemonTimeout: DEFAULT_DAEMON_TIMEOUT_MS,
  enableSharing: true,
}

/** `~/.vplan` — the config directory. */
export const configDir = join(homedir(), '.vplan')

/** Path to the config file within `dir` (defaults to the real `~/.vplan`). */
export function configFilePath(dir: string = configDir): string {
  return join(dir, 'config.json')
}

function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

/** A valid `daemonTimeout` is a positive, finite integer count of milliseconds. */
function isDaemonTimeout(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/** A valid `enableSharing` is a real boolean; a JSON string like `"false"` is not one. */
function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

/**
 * Read the persisted config. Returns defaults when the file is missing or malformed (an absent or
 * hand-broken config must never break a render), and ignores an unknown `theme`, a non-positive
 * `daemonTimeout`, or a non-boolean `enableSharing`, falling back to the default for each field
 * independently. `dir` overrides the config directory for tests; production calls it with the
 * default `~/.vplan`.
 */
export async function readConfig(dir: string = configDir): Promise<Config> {
  try {
    const parsed = JSON.parse(await readFile(configFilePath(dir), 'utf8')) as {
      theme?: unknown
      daemonTimeout?: unknown
      enableSharing?: unknown
    } | null
    return {
      theme: isTheme(parsed?.theme) ? parsed.theme : DEFAULT_CONFIG.theme,
      daemonTimeout: isDaemonTimeout(parsed?.daemonTimeout)
        ? parsed.daemonTimeout
        : DEFAULT_CONFIG.daemonTimeout,
      enableSharing: isBoolean(parsed?.enableSharing)
        ? parsed.enableSharing
        : DEFAULT_CONFIG.enableSharing,
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

/**
 * Whether a render should show the plan's share button: an explicit `--no-share` (`share === false`,
 * as commander leaves it for a negated flag) wins over the persisted `enableSharing` default. The
 * programmatic API bypasses this and passes `enableSharing` to `renderPlan` directly.
 */
export function sharesPlan(config: Config, share?: boolean): boolean {
  return share !== false && config.enableSharing
}

/**
 * Write the config to `~/.vplan/config.json`, creating the directory if needed. Used by the
 * `vplan config set` command; the render path only reads.
 */
export async function writeConfig(config: Config, dir: string = configDir): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(configFilePath(dir), `${JSON.stringify(config, null, 2)}\n`)
}
