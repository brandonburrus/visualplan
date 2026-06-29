// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readConfig, writeConfig } from '../src/config.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'visualplan-config-test-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const DAEMON_15M = 15 * 60 * 1000

describe('readConfig', () => {
  it('reads a stored theme and daemonTimeout (golden)', async () => {
    await writeFile(
      join(dir, 'config.json'),
      JSON.stringify({ theme: 'dark', daemonTimeout: 60000 }),
    )
    expect(await readConfig(dir)).toEqual({ theme: 'dark', daemonTimeout: 60000 })
  })

  it('defaults each field on malformed JSON or an unknown theme (error)', async () => {
    await writeFile(join(dir, 'config.json'), '{ not json')
    expect(await readConfig(dir)).toEqual({ theme: 'system', daemonTimeout: DAEMON_15M })

    await writeFile(join(dir, 'config.json'), JSON.stringify({ theme: 'neon' }))
    expect(await readConfig(dir)).toEqual({ theme: 'system', daemonTimeout: DAEMON_15M })
  })

  it('falls back to the default daemonTimeout for a non-positive or non-integer value (edge)', async () => {
    // A stored theme is kept while only the bad daemonTimeout falls back, proving the fields are
    // validated independently rather than the whole file being rejected.
    await writeFile(join(dir, 'config.json'), JSON.stringify({ theme: 'light', daemonTimeout: -5 }))
    expect(await readConfig(dir)).toEqual({ theme: 'light', daemonTimeout: DAEMON_15M })

    await writeFile(
      join(dir, 'config.json'),
      JSON.stringify({ theme: 'light', daemonTimeout: 1.5 }),
    )
    expect(await readConfig(dir)).toEqual({ theme: 'light', daemonTimeout: DAEMON_15M })
  })

  it('defaults both fields when the file is absent (edge)', async () => {
    expect(await readConfig(dir)).toEqual({ theme: 'system', daemonTimeout: DAEMON_15M })
  })
})

describe('writeConfig', () => {
  it('persists a config that readConfig round-trips (golden)', async () => {
    await writeConfig({ theme: 'light', daemonTimeout: 90000 }, dir)
    expect(await readConfig(dir)).toEqual({ theme: 'light', daemonTimeout: 90000 })
  })

  it('creates the config directory if it does not exist (edge)', async () => {
    const nested = join(dir, 'does', 'not', 'exist')
    await writeConfig({ theme: 'dark', daemonTimeout: DAEMON_15M }, nested)
    const written = JSON.parse(await readFile(join(nested, 'config.json'), 'utf8'))
    expect(written).toEqual({ theme: 'dark', daemonTimeout: DAEMON_15M })
  })
})
