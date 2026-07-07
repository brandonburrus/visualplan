import type { QueueEntry } from '@visualplan/core'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueueShell } from '../components/queue/QueueShell.js'

/** A minimal EventSource stand-in the test drives directly, mirroring the daemon's `queue` event. */
class FakeEventSource {
  static last: FakeEventSource | null = null
  url: string
  closed = false
  private listeners = new Map<string, ((event: MessageEvent) => void)[]>()

  constructor(url: string) {
    this.url = url
    FakeEventSource.last = this
  }

  addEventListener(type: string, fn: (event: MessageEvent) => void): void {
    const list = this.listeners.get(type) ?? []
    list.push(fn)
    this.listeners.set(type, list)
  }

  removeEventListener(type: string, fn: (event: MessageEvent) => void): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter(f => f !== fn),
    )
  }

  close(): void {
    this.closed = true
  }

  /** Push a `queue` payload to the shell as the daemon would. */
  emitQueue(entries: QueueEntry[]): void {
    const event = new MessageEvent('queue', { data: JSON.stringify(entries) })
    for (const fn of this.listeners.get('queue') ?? []) fn(event)
  }
}

function entry(
  id: string,
  status: QueueEntry['status'] = 'pending',
  extra: Partial<QueueEntry> = {},
): QueueEntry {
  return { id, title: `Plan ${id}`, dir: `dir-${id}`, status, ...extra }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  FakeEventSource.last = null
  vi.stubGlobal('EventSource', FakeEventSource)
})

afterEach(() => {
  act(() => root?.unmount())
  container.remove()
  vi.restoreAllMocks()
})

function render(): void {
  root = createRoot(container)
  act(() => root.render(<QueueShell />))
}

function source(): FakeEventSource {
  if (!FakeEventSource.last) throw new Error('EventSource was not opened')
  return FakeEventSource.last
}

function iframeSrc(): string | null {
  return container.querySelector('iframe')?.getAttribute('src') ?? null
}

function sidebar(): Element | null {
  return container.querySelector('.vp-queue__sidebar')
}

describe('QueueShell', () => {
  it('opens the events stream for liveness on mount (golden)', () => {
    render()
    expect(source().url).toBe('/__vp_events')
  })

  it('renders a sidebar row per entry with title and originating dir (golden)', () => {
    render()
    act(() => source().emitQueue([entry('a'), entry('b')]))
    const text = container.textContent ?? ''
    expect(text).toContain('Plan a')
    expect(text).toContain('dir-a')
    expect(text).toContain('Plan b')
    expect(text).toContain('dir-b')
  })

  it('defaults the active iframe to the first pending plan (golden)', () => {
    render()
    act(() => source().emitQueue([entry('a', 'done'), entry('b'), entry('c')]))
    expect(iframeSrc()).toBe('/plan/b?rev=1')
  })

  it('auto-advances the iframe when the active plan is marked done (golden)', () => {
    render()
    act(() => source().emitQueue([entry('a'), entry('b')]))
    expect(iframeSrc()).toBe('/plan/a?rev=1')
    act(() => source().emitQueue([entry('a', 'done'), entry('b')]))
    expect(iframeSrc()).toBe('/plan/b?rev=1')
  })

  it('shows an all-reviewed empty state when every plan is done (edge)', () => {
    render()
    act(() => source().emitQueue([entry('a', 'done'), entry('b', 'done')]))
    expect(container.querySelector('iframe')).toBeNull()
    expect((container.textContent ?? '').toLowerCase()).toContain('reviewed')
  })

  it('reloads a decided plan in the iframe when its row is reselected (golden)', () => {
    render()
    act(() =>
      source().emitQueue([
        entry('a', 'done', { decision: 'approve' }),
        entry('b', 'done', { decision: 'deny' }),
      ]),
    )
    // All done: nothing is auto-selected, so the empty state shows.
    expect(container.querySelector('iframe')).toBeNull()
    // Clicking a decided row loads it (the daemon serves it locked into its verdict).
    act(() => container.querySelector<HTMLButtonElement>('.vp-queue__row')?.click())
    expect(iframeSrc()).toBe('/plan/a?rev=1')
  })

  it('shows a progress count of reviewed plans (edge)', () => {
    render()
    act(() => source().emitQueue([entry('a', 'done'), entry('b'), entry('c')]))
    expect(container.textContent ?? '').toContain('1 of 3')
  })

  it('moves the active plan with the j key (golden)', () => {
    render()
    act(() => source().emitQueue([entry('a'), entry('b'), entry('c')]))
    expect(iframeSrc()).toBe('/plan/a?rev=1')
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }))
    })
    expect(iframeSrc()).toBe('/plan/b?rev=1')
  })

  it('closes the events stream on unmount (error)', () => {
    render()
    const es = source()
    act(() => root.unmount())
    expect(es.closed).toBe(true)
  })
})

// In-place revisions reuse the plan id; the iframe is keyed and cache-busted by `rev` so a revised
// plan remounts with fresh content while an unchanged rev keeps the same mounted frame.
describe('QueueShell iframe revision keying', () => {
  it('remounts the iframe with the new rev in its src when a revision arrives (golden)', () => {
    render()
    act(() => source().emitQueue([entry('a', 'pending', { rev: 1 })]))
    expect(iframeSrc()).toBe('/plan/a?rev=1')
    act(() => source().emitQueue([entry('a', 'pending', { rev: 2 })]))
    expect(iframeSrc()).toBe('/plan/a?rev=2')
  })

  it('keeps the same mounted iframe across frames while the rev is unchanged (edge)', () => {
    render()
    act(() => source().emitQueue([entry('a', 'pending', { rev: 1 })]))
    const frame = container.querySelector('iframe')
    act(() => source().emitQueue([entry('a', 'pending', { rev: 1 }), entry('b')]))
    expect(container.querySelector('iframe')).toBe(frame)
  })

  it('stays on an active plan that flips to iterating, iframe still mounted (golden)', () => {
    render()
    act(() => source().emitQueue([entry('a', 'pending', { rev: 1 })]))
    const frame = container.querySelector('iframe')
    act(() => source().emitQueue([entry('a', 'iterating', { rev: 1 })]))
    // No auto-advance and no "All plans reviewed" empty state: the reviewer waits in place.
    expect(container.querySelector('iframe')).toBe(frame)
    expect(container.textContent ?? '').not.toContain('All plans reviewed')
  })
})

// A background entry's in-place revision raises a small accent dot on its row (never a focus
// steal); viewing the row marks the revision seen and clears the dot.
describe('QueueShell unseen revision dots', () => {
  function rowFor(title: string): HTMLButtonElement | null {
    return (
      Array.from(container.querySelectorAll<HTMLButtonElement>('.vp-queue__row')).find(r =>
        (r.getAttribute('aria-label') ?? '').startsWith(title),
      ) ?? null
    )
  }

  it('dots a background entry when its revision arrives (golden)', () => {
    render()
    act(() => source().emitQueue([entry('a'), entry('b')]))
    act(() => source().emitQueue([entry('a'), entry('b', 'pending', { rev: 2 })]))
    const row = rowFor('Plan b')
    expect(row?.querySelector('.vp-queue__dot')).not.toBeNull()
    expect(row?.getAttribute('aria-label')).toContain('updated')
  })

  it('clears the dot once the updated entry is selected (golden)', () => {
    render()
    act(() => source().emitQueue([entry('a'), entry('b')]))
    act(() => source().emitQueue([entry('a'), entry('b', 'pending', { rev: 2 })]))
    act(() => rowFor('Plan b')?.click())
    expect(rowFor('Plan b')?.querySelector('.vp-queue__dot')).toBeNull()
  })

  it('never dots the active entry on its own revision (edge)', () => {
    render()
    act(() => source().emitQueue([entry('a'), entry('b')]))
    act(() => source().emitQueue([entry('a', 'pending', { rev: 2 }), entry('b')]))
    expect(rowFor('Plan a')?.querySelector('.vp-queue__dot')).toBeNull()
  })

  it('does not dot brand-new rows arriving at rev 1 (edge)', () => {
    render()
    act(() => source().emitQueue([entry('a'), entry('b')]))
    expect(container.querySelector('.vp-queue__dot')).toBeNull()
  })
})

// The daemon distinguishes a real unload (short deny grace) from a silent socket drop (long grace)
// by this beacon; it fires unconditionally because a reload's SSE reconnect cancels the short grace.
describe('QueueShell close beacon', () => {
  afterEach(() => {
    Reflect.deleteProperty(window.navigator, 'sendBeacon')
  })

  it('notifies the daemon via sendBeacon on pagehide (golden)', () => {
    const beacon = vi.fn(() => true)
    Object.defineProperty(window.navigator, 'sendBeacon', { value: beacon, configurable: true })
    render()
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(beacon).toHaveBeenCalledWith('/__vp_shell_closed')
  })

  it('survives pagehide when sendBeacon is unavailable (error)', () => {
    render()
    expect(() =>
      act(() => {
        window.dispatchEvent(new Event('pagehide'))
      }),
    ).not.toThrow()
  })

  it('stops firing after unmount (edge)', () => {
    const beacon = vi.fn(() => true)
    Object.defineProperty(window.navigator, 'sendBeacon', { value: beacon, configurable: true })
    render()
    act(() => root.unmount())
    window.dispatchEvent(new Event('pagehide'))
    expect(beacon).not.toHaveBeenCalled()
  })
})

// Closing the tab with undecided plans denies them, so the user gets a native confirm; decided and
// iterating plans are already resolved to their callers and must not block a close.
describe('QueueShell beforeunload guard', () => {
  function fireBeforeUnload(): Event {
    const event = new Event('beforeunload', { cancelable: true })
    act(() => {
      window.dispatchEvent(event)
    })
    return event
  }

  it('prevents the unload while an undecided plan is pending (golden)', () => {
    render()
    act(() => source().emitQueue([entry('a'), entry('b', 'done')]))
    expect(fireBeforeUnload().defaultPrevented).toBe(true)
  })

  it('lets the unload proceed when every plan is done or iterating (golden)', () => {
    render()
    act(() => source().emitQueue([entry('a', 'done'), entry('b', 'iterating')]))
    expect(fireBeforeUnload().defaultPrevented).toBe(false)
  })

  it('lets the unload proceed for an empty queue (edge)', () => {
    render()
    expect(fireBeforeUnload().defaultPrevented).toBe(false)
  })
})

describe('QueueShell revising count', () => {
  it('appends the revising count to the sidebar header when plans are iterating (golden)', () => {
    render()
    act(() => source().emitQueue([entry('a', 'done'), entry('b', 'iterating'), entry('c')]))
    expect(container.querySelector('.vp-queue__count')?.textContent).toBe(
      '1 of 3 reviewed - 1 revising',
    )
  })

  it('omits the revising suffix when nothing is iterating (edge)', () => {
    render()
    act(() => source().emitQueue([entry('a', 'done'), entry('b')]))
    expect(container.querySelector('.vp-queue__count')?.textContent).toBe('1 of 2 reviewed')
  })

  it('announces the revising count in the live region (golden)', () => {
    render()
    act(() => source().emitQueue([entry('a', 'done'), entry('b', 'iterating'), entry('c')]))
    const live = container.querySelector('[aria-live="polite"]')
    expect(live?.textContent).toBe(
      '1 of 3 plans reviewed, 1 awaiting revision. Now reviewing Plan c',
    )
  })
})

describe('QueueShell iterating rows', () => {
  it("labels an iterating row 'awaiting revision' (golden)", () => {
    render()
    act(() => source().emitQueue([entry('a', 'iterating'), entry('b')]))
    const row = container.querySelector('.vp-queue__row')
    expect(row?.getAttribute('aria-label')).toBe('Plan a, dir-a, awaiting revision')
  })

  it('marks the iterating row with its status for the spinner styling (golden)', () => {
    render()
    act(() => source().emitQueue([entry('a', 'iterating'), entry('b')]))
    expect(container.querySelector('.vp-queue__row')?.getAttribute('data-status')).toBe('iterating')
  })
})

describe('QueueShell relative timestamps', () => {
  it('shows a muted relative time on a row carrying updatedAt, also in its name (golden)', () => {
    // Computed before render: the shell's clock starts at mount, so a timestamp taken after it
    // would land fractionally under the 5m bucket and flake to '4m ago'.
    const updatedAt = Date.now() - 5 * 60_000
    render()
    act(() => source().emitQueue([entry('a', 'pending', { updatedAt })]))
    const row = container.querySelector('.vp-queue__row')
    expect(row?.querySelector('.vp-queue__time')?.textContent).toBe('5m ago')
    expect(row?.getAttribute('aria-label')).toContain('5m ago')
  })

  it('omits the timestamp when an older daemon sends no updatedAt (edge)', () => {
    render()
    act(() => source().emitQueue([entry('a')]))
    expect(container.querySelector('.vp-queue__time')).toBeNull()
  })

  it('advances timestamps as time passes without new frames (golden)', () => {
    vi.useFakeTimers()
    try {
      render()
      act(() => source().emitQueue([entry('a', 'pending', { updatedAt: Date.now() })]))
      expect(container.querySelector('.vp-queue__time')?.textContent).toBe('just now')
      act(() => vi.advanceTimersByTime(90_000))
      expect(container.querySelector('.vp-queue__time')?.textContent).toBe('1m ago')
    } finally {
      vi.useRealTimers()
    }
  })
})

// The sidebar is the session's history rail, so it renders even for a lone plan: a solo review
// still shows its row, status, and progress instead of masquerading as a plain single render.
describe('QueueShell always-on sidebar', () => {
  it('renders the sidebar for a single-entry queue (golden)', () => {
    render()
    act(() => source().emitQueue([entry('a')]))
    expect(sidebar()).not.toBeNull()
    expect(iframeSrc()).toContain('/plan/a')
  })

  it('keeps the sidebar when the queue drops back to a single plan (edge)', () => {
    render()
    act(() => source().emitQueue([entry('a'), entry('b')]))
    expect(sidebar()).not.toBeNull()
    act(() => source().emitQueue([entry('a')]))
    expect(sidebar()).not.toBeNull()
  })
})

describe('QueueShell accessibility', () => {
  function rows(): HTMLButtonElement[] {
    return Array.from(container.querySelectorAll('.vp-queue__row'))
  }

  it('announces review progress and the active plan in a polite live region (golden)', () => {
    render()
    act(() => source().emitQueue([entry('a', 'done'), entry('b'), entry('c')]))
    const live = container.querySelector('[aria-live="polite"]')
    expect(live?.textContent).toContain('1 of 3 plans reviewed')
    expect(live?.textContent).toContain('Now reviewing Plan b')
  })

  it('names each row with its origin dir and review status, not by color alone (golden)', () => {
    render()
    act(() => source().emitQueue([entry('a', 'done', { decision: 'approve' }), entry('b')]))
    expect(rows()[0].getAttribute('aria-label')).toBe('Plan a, dir-a, approved')
    expect(rows()[1].getAttribute('aria-label')).toBe('Plan b, dir-b, to review')
  })

  it('keeps only the active row in the tab order (roving tabindex) (golden)', () => {
    render()
    act(() => source().emitQueue([entry('a', 'done'), entry('b'), entry('c')]))
    // The active plan defaults to the first pending one (b); only it is tabbable.
    const tabindices = rows().map(r => r.getAttribute('tabindex'))
    expect(tabindices).toEqual(['-1', '0', '-1'])
  })

  it('makes the first row tabbable when no plan is active yet (edge)', () => {
    render()
    // All done means nothing is active; the list must still be reachable by keyboard.
    act(() => source().emitQueue([entry('a', 'done'), entry('b', 'done')]))
    expect(rows().map(r => r.getAttribute('tabindex'))).toEqual(['0', '-1'])
  })
})

describe('QueueShell titles', () => {
  it('labels the sidebar "Plans to Review" (golden)', () => {
    render()
    act(() => source().emitQueue([entry('a'), entry('b')]))
    expect(container.querySelector('.vp-queue__title')?.textContent ?? '').toBe('Plans to Review')
  })

  it('sets the tab title to the active plan being reviewed (golden)', () => {
    render()
    act(() =>
      source().emitQueue([entry('a', 'done', { decision: 'approve' }), entry('b'), entry('c')]),
    )
    // The active plan defaults to the first pending one (b).
    expect(document.title).toBe('Plan b')
  })

  it('falls back to the default queue title when no plan is active (edge)', () => {
    render()
    act(() => source().emitQueue([entry('a', 'done', { decision: 'approve' })]))
    expect(document.title).toBe('Visual Plan Review Queue')
  })
})

describe('QueueShell background activity dot', () => {
  function setHidden(hidden: boolean): void {
    Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
    Object.defineProperty(document, 'visibilityState', {
      value: hidden ? 'hidden' : 'visible',
      configurable: true,
    })
  }

  function faviconHasDot(): boolean {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    return decodeURIComponent(link?.href ?? '').includes('<circle')
  }

  afterEach(() => setHidden(false))

  it('raises the favicon dot when a plan arrives while the tab is hidden (golden)', () => {
    setHidden(true)
    render()
    act(() => source().emitQueue([entry('a'), entry('b')]))
    expect(faviconHasDot()).toBe(true)
  })

  it('leaves the favicon plain when the tab is in the foreground (edge)', () => {
    setHidden(false)
    render()
    act(() => source().emitQueue([entry('a'), entry('b')]))
    expect(faviconHasDot()).toBe(false)
  })

  it('clears the dot when the tab returns to the foreground (golden)', () => {
    setHidden(true)
    render()
    act(() => source().emitQueue([entry('a'), entry('b')]))
    expect(faviconHasDot()).toBe(true)
    act(() => {
      setHidden(false)
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(faviconHasDot()).toBe(false)
  })
})

describe('QueueShell decision icons and version chips', () => {
  function rows(): HTMLButtonElement[] {
    return Array.from(container.querySelectorAll('.vp-queue__row'))
  }

  it('marks each decided row with its locked-in verdict, not a generic done (golden)', () => {
    render()
    act(() =>
      source().emitQueue([
        entry('a', 'done', { decision: 'approve' }),
        entry('b', 'done', { decision: 'deny' }),
        entry('c', 'done', { decision: 'iterate' }),
      ]),
    )
    expect(rows().map(r => r.getAttribute('data-decision'))).toEqual(['approve', 'deny', 'iterate'])
  })

  it('carries no decision attribute while a plan is pending (edge)', () => {
    render()
    act(() => source().emitQueue([entry('a'), entry('b')]))
    expect(rows()[0].getAttribute('data-decision')).toBeNull()
  })

  it('shows a version chip for an iteration but not for a first review (golden)', () => {
    render()
    act(() => source().emitQueue([entry('a', 'pending', { iteration: 3 }), entry('b')]))
    const chips = Array.from(container.querySelectorAll('.vp-queue__chip')).map(c => c.textContent)
    expect(chips).toEqual(['v3'])
  })

  it('names a row with its version and locked-in verdict (golden)', () => {
    render()
    act(() =>
      source().emitQueue([entry('a', 'done', { decision: 'approve', iteration: 2 }), entry('b')]),
    )
    expect(rows()[0].getAttribute('aria-label')).toBe('Plan a, dir-a, v2, approved')
  })
})
