import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyThemePreference,
  getThemePreference,
  isThemeLocked,
  setThemePreference,
  watchSystemScheme,
} from '../theme.js'

/** A controllable `matchMedia` stub (jsdom has none). Tracks listeners so a scheme change can be
 * simulated, and lets a test set whether the OS currently prefers dark. */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>()
  const mql = {
    matches,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }
  vi.stubGlobal('matchMedia', () => mql)
  return {
    mql,
    fire: () => {
      for (const fn of listeners) fn()
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  ;(globalThis as { __VP_CONFIG__?: unknown }).__VP_CONFIG__ = undefined
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isThemeLocked / locked getThemePreference', () => {
  it('is unlocked with no injected config (golden)', () => {
    expect(isThemeLocked()).toBe(false)
  })

  it('reports locked and ignores the localStorage override when locked (edge)', () => {
    localStorage.setItem('vp-theme', 'light')
    ;(globalThis as { __VP_CONFIG__?: unknown }).__VP_CONFIG__ = { theme: 'dark', lockTheme: true }
    expect(isThemeLocked()).toBe(true)
    // Locked: the injected theme wins over the stored override.
    expect(getThemePreference()).toBe('dark')
  })
})

describe('getThemePreference', () => {
  it('returns the stored override when present (golden)', () => {
    localStorage.setItem('vp-theme', 'dark')
    expect(getThemePreference()).toBe('dark')
  })

  it('falls back to the injected config default for an invalid stored value (error)', () => {
    localStorage.setItem('vp-theme', 'neon')
    ;(globalThis as { __VP_CONFIG__?: { theme: string } }).__VP_CONFIG__ = { theme: 'light' }
    expect(getThemePreference()).toBe('light')
  })

  it('defaults to system with no override and no injected config (edge)', () => {
    expect(getThemePreference()).toBe('system')
  })
})

describe('setThemePreference', () => {
  it('persists the preference and applies it to <html> (golden)', () => {
    setThemePreference('dark')
    expect(localStorage.getItem('vp-theme')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})

describe('applyThemePreference', () => {
  it('applies an explicit scheme without consulting the OS (golden)', () => {
    applyThemePreference('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('resolves system against the OS preference (edge)', () => {
    stubMatchMedia(true)
    applyThemePreference('system')
    expect(document.documentElement.dataset.theme).toBe('dark')

    stubMatchMedia(false)
    applyThemePreference('system')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})

describe('watchSystemScheme', () => {
  it('re-applies on an OS change while the preference is system (golden)', () => {
    const { mql, fire } = stubMatchMedia(false)
    applyThemePreference('system')
    watchSystemScheme(() => 'system')
    expect(document.documentElement.dataset.theme).toBe('light')

    mql.matches = true
    fire()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('ignores OS changes when the preference is not system (error)', () => {
    const { mql, fire } = stubMatchMedia(false)
    applyThemePreference('light')
    watchSystemScheme(() => 'light')

    mql.matches = true
    fire()
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('returns a no-op cleanup when matchMedia is unavailable (edge)', () => {
    expect(typeof matchMedia).toBe('undefined')
    const cleanup = watchSystemScheme(() => 'system')
    expect(() => cleanup()).not.toThrow()
  })
})
