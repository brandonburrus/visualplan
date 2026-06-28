import type { QueueEntry } from '@visualplan/core'
import { describe, expect, it } from 'vitest'
import {
  firstPendingId,
  moveSelection,
  nextActiveId,
  reviewedCount,
} from '../components/queue/logic.js'

function entry(id: string, status: QueueEntry['status'] = 'pending'): QueueEntry {
  return { id, title: `Plan ${id}`, dir: 'proj', status }
}

describe('firstPendingId', () => {
  it('returns the first not-yet-done entry (golden)', () => {
    expect(firstPendingId([entry('a', 'done'), entry('b'), entry('c')])).toBe('b')
  })

  it('returns null when every entry is done (edge)', () => {
    expect(firstPendingId([entry('a', 'done'), entry('b', 'done')])).toBeNull()
  })

  it('returns null for an empty queue (error)', () => {
    expect(firstPendingId([])).toBeNull()
  })
})

describe('nextActiveId: auto-advance when the active plan finishes', () => {
  it('keeps the active id while it is still pending (golden)', () => {
    const entries = [entry('a'), entry('b')]
    expect(nextActiveId(entries, 'a')).toBe('a')
  })

  it('advances to the next pending plan once the active one is done (golden)', () => {
    const entries = [entry('a', 'done'), entry('b'), entry('c')]
    expect(nextActiveId(entries, 'a')).toBe('b')
  })

  it('returns null when the active plan was the last pending one (edge)', () => {
    const entries = [entry('a', 'done'), entry('b', 'done')]
    expect(nextActiveId(entries, 'b')).toBeNull()
  })

  it('falls back to the first pending when the active id is unknown (error)', () => {
    const entries = [entry('a', 'done'), entry('b')]
    expect(nextActiveId(entries, 'gone')).toBe('b')
  })
})

describe('moveSelection: keyboard navigation', () => {
  const entries = [entry('a'), entry('b'), entry('c')]

  it('moves down to the next entry (golden)', () => {
    expect(moveSelection(entries, 'a', 1)).toBe('b')
  })

  it('moves up to the previous entry (golden)', () => {
    expect(moveSelection(entries, 'b', -1)).toBe('a')
  })

  it('clamps at the last entry moving down (edge)', () => {
    expect(moveSelection(entries, 'c', 1)).toBe('c')
  })

  it('clamps at the first entry moving up (edge)', () => {
    expect(moveSelection(entries, 'a', -1)).toBe('a')
  })

  it('selects the first entry when nothing is active (error)', () => {
    expect(moveSelection(entries, null, 1)).toBe('a')
  })

  it('returns null for an empty queue (error)', () => {
    expect(moveSelection([], 'a', 1)).toBeNull()
  })
})

describe('reviewedCount', () => {
  it('counts done entries (golden)', () => {
    expect(reviewedCount([entry('a', 'done'), entry('b'), entry('c', 'done')])).toBe(2)
  })

  it('is zero when none are done (edge)', () => {
    expect(reviewedCount([entry('a'), entry('b')])).toBe(0)
  })

  it('is zero for an empty queue (error)', () => {
    expect(reviewedCount([])).toBe(0)
  })
})
