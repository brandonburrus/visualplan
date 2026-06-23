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

describe('readConfig', () => {
  it('reads a stored theme (golden)', async () => {
    await writeFile(join(dir, 'config.json'), JSON.stringify({ theme: 'dark' }))
    expect(await readConfig(dir)).toEqual({ theme: 'dark' })
  })

  it('defaults to system on malformed JSON or an unknown theme (error)', async () => {
    await writeFile(join(dir, 'config.json'), '{ not json')
    expect(await readConfig(dir)).toEqual({ theme: 'system' })

    await writeFile(join(dir, 'config.json'), JSON.stringify({ theme: 'neon' }))
    expect(await readConfig(dir)).toEqual({ theme: 'system' })
  })

  it('defaults to system when the file is absent (edge)', async () => {
    expect(await readConfig(dir)).toEqual({ theme: 'system' })
  })
})

describe('writeConfig', () => {
  it('persists a config that readConfig round-trips (golden)', async () => {
    await writeConfig({ theme: 'light' }, dir)
    expect(await readConfig(dir)).toEqual({ theme: 'light' })
  })

  it('creates the config directory if it does not exist (edge)', async () => {
    const nested = join(dir, 'does', 'not', 'exist')
    await writeConfig({ theme: 'dark' }, nested)
    const written = JSON.parse(await readFile(join(nested, 'config.json'), 'utf8'))
    expect(written).toEqual({ theme: 'dark' })
  })
})
