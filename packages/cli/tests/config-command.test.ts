// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runConfigGet, runConfigPath, runConfigSet, runConfigShow } from '../src/commands/config.js'
import { readConfig } from '../src/config.js'

let dir: string
let out: string[]

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'visualplan-config-cmd-test-'))
  out = []
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    out.push(String(chunk))
    return true
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(dir, { recursive: true, force: true })
})

describe('config set', () => {
  it('persists a valid theme and confirms it (golden)', async () => {
    await runConfigSet('theme', 'dark', dir)
    expect(await readConfig(dir)).toEqual({ theme: 'dark' })
    expect(out.join('')).toContain('Set theme = dark')
  })

  it('rejects an invalid value or unknown key without writing (error)', async () => {
    await expect(runConfigSet('theme', 'neon', dir)).rejects.toThrow(/Invalid theme "neon"/)
    await expect(runConfigSet('color', 'dark', dir)).rejects.toThrow(/Unknown config key "color"/)
    // Nothing was written, so a read still returns the default.
    expect(await readConfig(dir)).toEqual({ theme: 'system' })
  })
})

describe('config get', () => {
  it('prints the stored value (golden)', async () => {
    await runConfigSet('theme', 'light', dir)
    out = []
    await runConfigGet('theme', dir)
    expect(out.join('')).toBe('light\n')
  })

  it('rejects an unknown key (error)', async () => {
    await expect(runConfigGet('color', dir)).rejects.toThrow(/Unknown config key "color"/)
  })
})

describe('config show', () => {
  it('prints the default theme and the path when no file exists yet (edge)', async () => {
    await runConfigShow(dir)
    const text = out.join('')
    expect(text).toContain('theme = system')
    expect(text).toContain(join(dir, 'config.json'))
  })
})

describe('config path', () => {
  it('prints the config file path (golden)', () => {
    runConfigPath(dir)
    expect(out.join('')).toBe(`${join(dir, 'config.json')}\n`)
  })
})
