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

function entry(id: string, status: QueueEntry['status'] = 'pending'): QueueEntry {
  return { id, title: `Plan ${id}`, dir: `dir-${id}`, status }
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
    expect(iframeSrc()).toBe('/plan/b')
  })

  it('auto-advances the iframe when the active plan is marked done (golden)', () => {
    render()
    act(() => source().emitQueue([entry('a'), entry('b')]))
    expect(iframeSrc()).toBe('/plan/a')
    act(() => source().emitQueue([entry('a', 'done'), entry('b')]))
    expect(iframeSrc()).toBe('/plan/b')
  })

  it('shows an all-reviewed empty state when every plan is done (edge)', () => {
    render()
    act(() => source().emitQueue([entry('a', 'done'), entry('b', 'done')]))
    expect(container.querySelector('iframe')).toBeNull()
    expect((container.textContent ?? '').toLowerCase()).toContain('reviewed')
  })

  it('shows a progress count of reviewed plans (edge)', () => {
    render()
    act(() => source().emitQueue([entry('a', 'done'), entry('b'), entry('c')]))
    expect(container.textContent ?? '').toContain('1 of 3')
  })

  it('moves the active plan with the j key (golden)', () => {
    render()
    act(() => source().emitQueue([entry('a'), entry('b'), entry('c')]))
    expect(iframeSrc()).toBe('/plan/a')
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }))
    })
    expect(iframeSrc()).toBe('/plan/b')
  })

  it('closes the events stream on unmount (error)', () => {
    render()
    const es = source()
    act(() => root.unmount())
    expect(es.closed).toBe(true)
  })
})

// The queue chrome is for navigating BETWEEN plans, so a lone plan should look like an ordinary
// single review (no sidebar); the sidebar appears only once a second plan is in the queue.
describe('QueueShell single-plan vs queue', () => {
  it('hides the sidebar and shows the plan full-width when only one plan is queued (golden)', () => {
    render()
    act(() => source().emitQueue([entry('a')]))
    expect(sidebar()).toBeNull()
    // The single plan still renders; it just has no queue rail beside it.
    expect(iframeSrc()).toBe('/plan/a')
  })

  it('reveals the sidebar when a second plan joins the queue mid-review (golden)', () => {
    render()
    act(() => source().emitQueue([entry('a')]))
    expect(sidebar()).toBeNull()
    act(() => source().emitQueue([entry('a'), entry('b')]))
    expect(sidebar()).not.toBeNull()
  })

  it('hides the sidebar again if the queue drops back to a single plan (edge)', () => {
    render()
    act(() => source().emitQueue([entry('a'), entry('b')]))
    expect(sidebar()).not.toBeNull()
    // A caller abandoning its plan removes it; back to one plan means back to no chrome.
    act(() => source().emitQueue([entry('a')]))
    expect(sidebar()).toBeNull()
  })
})
