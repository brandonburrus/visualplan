/**
 * The tab favicon, with an optional yellow activity dot. The base glyph mirrors the static favicon
 * in `queue.html`; the dot is shown while the tab is backgrounded and a plan is added or updated, so
 * the user gets a passive cue that the queue changed without the tab in front.
 */

// The base report/checklist glyph (paths and the light/dark stroke style), matching queue.html.
const GLYPH =
  '<style>path{stroke:#1a1a1c}@media(prefers-color-scheme:dark){path{stroke:#e9e9e6}}</style>' +
  '<path d="M15 21h-9a3 3 0 0 1 -3 -3v-1h10v2a2 2 0 0 0 4 0v-14a2 2 0 1 1 2 2h-2m2 -4h-11a3 3 0 0 0 -3 3v11"/>' +
  '<path d="M9 7l4 0"/><path d="M9 11l4 0"/>'

// A filled yellow dot in the top-right corner; its own fill wins over the path stroke style above.
const DOT = '<circle cx="17" cy="6" r="6" fill="#eab308"/>'

/** The favicon as an SVG data URI, with the activity dot when `withDot`. */
export function faviconHref(withDot: boolean): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke-width="2" ' +
    `stroke-linecap="round" stroke-linejoin="round">${GLYPH}${withDot ? DOT : ''}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** Point the page's favicon at the dotted or plain glyph, creating the `<link>` if absent. */
export function setActivityDot(withDot: boolean): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  link.href = faviconHref(withDot)
}
