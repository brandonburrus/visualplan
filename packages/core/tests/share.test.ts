import { describe, expect, it } from 'vitest'
import { decodePlan, encodePlan } from '../src/share.js'

describe('plan share codec', () => {
  it('round-trips an MDX plan through encode then decode (golden)', () => {
    const mdx =
      '# Add rate limiting\n\n<Phase title="Build" status="active">\n- step one\n</Phase>\n'
    expect(decodePlan(encodePlan(mdx))).toBe(mdx)
  })

  it('produces a URL-safe payload (no +, /, or = padding) (golden)', () => {
    const data = encodePlan('# A plan whose deflate output exercises base64 padding bytes')
    expect(data).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('round-trips multibyte unicode exactly (edge)', () => {
    const mdx = '# 计划 cafe resume 🚀\n\nNon-ASCII: over, under, accents.\n'
    expect(decodePlan(encodePlan(mdx))).toBe(mdx)
  })

  it('round-trips an empty string (edge)', () => {
    expect(decodePlan(encodePlan(''))).toBe('')
  })

  it('throws on a payload that is not valid deflate data (error)', () => {
    // Valid base64url characters, but the bytes are not a deflate stream.
    expect(() => decodePlan('AAAAAAAAAAAA')).toThrow()
  })

  it('throws on a payload with invalid base64 characters (error)', () => {
    expect(() => decodePlan('@@@not base64@@@')).toThrow()
  })
})
