// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { fileIconSvg, iconNameForFile } from '../src/file-icons.js'

// iconNameForFile resolves a title's filename to a Material Icon Theme icon name through the
// package's published manifest, so these assertions pin the resolution order against real data.
describe('iconNameForFile', () => {
  it('maps a simple extension to its icon (golden)', () => {
    expect(iconNameForFile('app.ts')).toBe('typescript')
    expect(iconNameForFile('Banner.tsx')).toBe('react_ts')
  })

  it('prefers an exact filename over its extension (edge)', () => {
    // package.json is a named file; without the override it would resolve by ".json".
    expect(iconNameForFile('package.json')).toBe('nodejs')
    expect(iconNameForFile('Dockerfile')).toBe('docker')
  })

  it('prefers the longest matching compound extension (edge)', () => {
    // "types.d.ts" must match "d.ts" (typescript-def), not the shorter "ts" (typescript).
    expect(iconNameForFile('types.d.ts')).toBe('typescript-def')
    expect(iconNameForFile('app.test.ts')).toBe('test-ts')
  })

  it('honors an explicit icon override when it names a real icon (edge)', () => {
    expect(iconNameForFile('anything.xyz', undefined, 'react')).toBe('react')
    // an override that names no icon is ignored and resolution continues
    expect(iconNameForFile('app.ts', undefined, 'not-a-real-icon')).toBe('typescript')
  })

  it('falls back to the language id, then the default file icon (error)', () => {
    expect(iconNameForFile('extensionless', 'typescript')).toBe('typescript')
    expect(iconNameForFile('mystery.zzznope')).toBe('file')
  })
})

describe('fileIconSvg', () => {
  it('returns the resolved icon SVG markup for a known type (golden)', () => {
    const svg = fileIconSvg('routes.ts')
    expect(svg).toMatch(/^<svg[\s>]/)
  })

  it('returns the default file icon SVG for an unknown extension (edge)', () => {
    // iconNameForFile resolves "mystery.zzznope" to the "file" default, which has an SVG.
    expect(fileIconSvg('mystery.zzznope')).toMatch(/<svg/)
  })
})
