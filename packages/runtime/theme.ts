/**
 * The page's color-scheme preference, shared by the cog (`ThemeToggle`) and `mount`. The CLI bakes
 * the configured default into `globalThis.__VP_CONFIG__` and sets the initial `<html data-theme>`
 * via an inline script (see `compile.ts` `themeBootstrap`); this module is the runtime half that
 * lets the cog override the scheme per-view, persisted in `localStorage`. Precedence matches the
 * bootstrap: the stored override, then the injected default, then `system` (the OS).
 */

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'vp-theme'
const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system']

interface InjectedConfig {
  theme?: ThemePreference
  /** When true the theme is fixed: the cog is hidden and the `localStorage` override is ignored. */
  lockTheme?: boolean
}

function isPreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (PREFERENCES as readonly string[]).includes(value)
}

function injectedConfig(): InjectedConfig {
  return (globalThis as { __VP_CONFIG__?: InjectedConfig }).__VP_CONFIG__ ?? {}
}

/** The render-time default the CLI/API injected (absent in tests / `/view`). */
function injectedDefault(): ThemePreference {
  const theme = injectedConfig().theme
  return isPreference(theme) ? theme : 'system'
}

/** Whether the API locked the theme (cog hidden, no per-view override). */
export function isThemeLocked(): boolean {
  return injectedConfig().lockTheme === true
}

/**
 * The active preference. A locked theme is the injected value verbatim; otherwise the stored
 * per-view override wins, then the injected default, then `system`.
 */
export function getThemePreference(): ThemePreference {
  if (isThemeLocked()) return injectedDefault()
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isPreference(stored)) return stored
  } catch {
    // localStorage can be unavailable or blocked (some file:// contexts); fall back to the default.
  }
  return injectedDefault()
}

function prefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
}

/** Resolve a preference to the concrete scheme to apply; `system` follows the OS. */
function resolveScheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') return preference
  return prefersDark() ? 'dark' : 'light'
}

/** Apply a preference to `<html data-theme>` now (recolors instantly; all colors are CSS vars). */
export function applyThemePreference(preference: ThemePreference): void {
  document.documentElement.dataset.theme = resolveScheme(preference)
}

/** Persist the per-view preference and apply it. The cog calls this; nothing writes to disk. */
export function setThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    // Persistence unavailable; still apply it for this view.
  }
  applyThemePreference(preference)
}

/**
 * Re-apply the theme when the OS scheme changes while the live preference is `system`, so a
 * `system` plan tracks the OS without a reload. `getPreference` is read on each change so the
 * listener reflects the latest choice. Returns a cleanup function.
 */
export function watchSystemScheme(getPreference: () => ThemePreference): () => void {
  if (typeof matchMedia !== 'function') return () => {}
  const query = matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    if (getPreference() === 'system') applyThemePreference('system')
  }
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
