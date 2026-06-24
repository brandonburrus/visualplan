// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parsePort } from '../src/commands/render.js'

describe('parsePort', () => {
  it('parses a valid port string to a number (golden)', () => {
    expect(parsePort('9140')).toBe(9140)
  })

  it('rejects a non-numeric port (error)', () => {
    expect(() => parsePort('abc')).toThrow(/integer between 1 and 65535/)
  })

  it('rejects ports outside the 1-65535 range and non-integers (edge)', () => {
    expect(() => parsePort('0')).toThrow()
    expect(() => parsePort('65536')).toThrow()
    expect(() => parsePort('9140.5')).toThrow()
    expect(parsePort('1')).toBe(1)
    expect(parsePort('65535')).toBe(65535)
  })
})
