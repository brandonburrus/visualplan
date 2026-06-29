import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { faviconHref, setActivityDot } from '../components/queue/favicon.js'

describe('faviconHref', () => {
  it('encodes the base glyph with no dot by default (golden)', () => {
    const href = faviconHref(false)
    expect(href.startsWith('data:image/svg+xml,')).toBe(true)
    expect(decodeURIComponent(href)).toContain('<svg')
    expect(decodeURIComponent(href)).not.toContain('<circle')
  })

  it('adds the blue activity dot in the bottom-right corner when asked (golden)', () => {
    const decoded = decodeURIComponent(faviconHref(true))
    expect(decoded).toContain('<circle')
    expect(decoded).toContain('#2f6fed')
    // Bottom-right of the 24x24 viewBox.
    expect(decoded).toContain('cx="17" cy="17"')
  })
})

describe('setActivityDot', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
  })

  afterEach(() => {
    document.head.innerHTML = ''
  })

  it('creates the favicon link and points it at the dotted glyph (golden)', () => {
    setActivityDot(true)
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    expect(link).not.toBeNull()
    expect(decodeURIComponent(link?.href ?? '')).toContain('<circle')
  })

  it('reuses the existing link and clears the dot (edge)', () => {
    const existing = document.createElement('link')
    existing.rel = 'icon'
    document.head.appendChild(existing)
    setActivityDot(true)
    setActivityDot(false)
    const links = document.querySelectorAll('link[rel="icon"]')
    expect(links.length).toBe(1)
    expect(decodeURIComponent((links[0] as HTMLLinkElement).href)).not.toContain('<circle')
  })
})
