// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readConfig, sharesPlan, writeConfig } from '../src/config.js'
import type { Config } from '../src/config.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'visualplan-config-test-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const DAEMON_15M = 15 * 60 * 1000

/** The built-in defaults: theme `system`, a 15m daemon TTL, and sharing on. */
const DEFAULTS: Config = { theme: 'system', daemonTimeout: DAEMON_15M, enableSharing: true }

describe('readConfig', () => {
  it('reads a stored theme, daemonTimeout, and enableSharing (golden)', async () => {
    await writeFile(
      join(dir, 'config.json'),
      JSON.stringify({ theme: 'dark', daemonTimeout: 60000, enableSharing: false }),
    )
    expect(await readConfig(dir)).toEqual({
      theme: 'dark',
      daemonTimeout: 60000,
      enableSharing: false,
    })
  })

  it('defaults each field on malformed JSON or an unknown theme (error)', async () => {
    await writeFile(join(dir, 'config.json'), '{ not json')
    expect(await readConfig(dir)).toEqual(DEFAULTS)

    await writeFile(join(dir, 'config.json'), JSON.stringify({ theme: 'neon' }))
    expect(await readConfig(dir)).toEqual(DEFAULTS)
  })

  it('falls back to the default daemonTimeout for a non-positive or non-integer value (edge)', async () => {
    // A stored theme is kept while only the bad daemonTimeout falls back, proving the fields are
    // validated independently rather than the whole file being rejected.
    await writeFile(join(dir, 'config.json'), JSON.stringify({ theme: 'light', daemonTimeout: -5 }))
    expect(await readConfig(dir)).toEqual({
      theme: 'light',
      daemonTimeout: DAEMON_15M,
      enableSharing: true,
    })

    await writeFile(
      join(dir, 'config.json'),
      JSON.stringify({ theme: 'light', daemonTimeout: 1.5 }),
    )
    expect(await readConfig(dir)).toEqual({
      theme: 'light',
      daemonTimeout: DAEMON_15M,
      enableSharing: true,
    })
  })

  it('falls back to the default enableSharing for a non-boolean value (edge)', async () => {
    // A JSON string is not a boolean, so `"false"` (an easy hand-edit mistake) must not silently
    // disable the share button; the theme is still honored, proving independent validation.
    await writeFile(
      join(dir, 'config.json'),
      JSON.stringify({ theme: 'light', enableSharing: 'false' }),
    )
    expect(await readConfig(dir)).toEqual({
      theme: 'light',
      daemonTimeout: DAEMON_15M,
      enableSharing: true,
    })
  })

  it('defaults every field when the file is absent (edge)', async () => {
    expect(await readConfig(dir)).toEqual(DEFAULTS)
  })
})

describe('writeConfig', () => {
  it('persists a config that readConfig round-trips (golden)', async () => {
    await writeConfig({ theme: 'light', daemonTimeout: 90000, enableSharing: false }, dir)
    expect(await readConfig(dir)).toEqual({
      theme: 'light',
      daemonTimeout: 90000,
      enableSharing: false,
    })
  })

  it('creates the config directory if it does not exist (edge)', async () => {
    const nested = join(dir, 'does', 'not', 'exist')
    await writeConfig({ theme: 'dark', daemonTimeout: DAEMON_15M, enableSharing: true }, nested)
    const written = JSON.parse(await readFile(join(nested, 'config.json'), 'utf8'))
    expect(written).toEqual({ theme: 'dark', daemonTimeout: DAEMON_15M, enableSharing: true })
  })
})

describe('sharesPlan', () => {
  it('follows the config when no flag is given (golden)', () => {
    expect(sharesPlan(DEFAULTS, undefined)).toBe(true)
    expect(sharesPlan({ ...DEFAULTS, enableSharing: false }, undefined)).toBe(false)
  })

  it('lets --no-share win over an enabled config (golden)', () => {
    expect(sharesPlan(DEFAULTS, false)).toBe(false)
  })

  it('leaves an explicit --share to the config value (edge)', () => {
    // Commander sets `share: true` for `--share` as well as for the flag's absence, so it cannot
    // re-enable sharing that the config disabled; only `--no-share` is authoritative.
    expect(sharesPlan(DEFAULTS, true)).toBe(true)
    expect(sharesPlan({ ...DEFAULTS, enableSharing: false }, true)).toBe(false)
  })
})
