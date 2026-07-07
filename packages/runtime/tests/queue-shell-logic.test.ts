import type { QueueEntry } from '@visualplan/core'
import { describe, expect, it } from 'vitest'
import {
  firstPendingId,
  hasNewActivity,
  moveSelection,
  nextActiveId,
  relativeTime,
  reviewedCount,
  revisingCount,
  unseenRevs,
} from '../components/queue/logic.js'

function entry(id: string, status: QueueEntry['status'] = 'pending', rev = 1): QueueEntry {
  return { id, title: `Plan ${id}`, dir: 'proj', status, rev }
}

describe('firstPendingId', () => {
  it('returns the first not-yet-done entry (golden)', () => {
    expect(firstPendingId([entry('a', 'done'), entry('b'), entry('c')])).toBe('b')
  })

  it('skips an iterating entry, which has nothing new to review yet (golden)', () => {
    expect(firstPendingId([entry('a', 'iterating'), entry('b'), entry('c')])).toBe('b')
  })

  it('returns null when every entry is done (edge)', () => {
    expect(firstPendingId([entry('a', 'done'), entry('b', 'done')])).toBeNull()
  })

  it('returns null when the only entries are iterating or done (edge)', () => {
    expect(firstPendingId([entry('a', 'iterating'), entry('b', 'done')])).toBeNull()
  })

  it('returns null for an empty queue (error)', () => {
    expect(firstPendingId([])).toBeNull()
  })
})

describe('nextActiveId: prev-aware auto-advance', () => {
  it('keeps the active id while it is still pending (golden)', () => {
    const prev = [entry('a'), entry('b')]
    const next = [entry('a'), entry('b')]
    expect(nextActiveId(prev, next, 'a')).toBe('a')
  })

  it('advances to the next pending plan on the frame the active one turns done (golden)', () => {
    const prev = [entry('a'), entry('b'), entry('c')]
    const next = [entry('a', 'done'), entry('b'), entry('c')]
    expect(nextActiveId(prev, next, 'a')).toBe('b')
  })

  it('stays on the active plan when it flips to iterating (golden)', () => {
    const prev = [entry('a'), entry('b')]
    const next = [entry('a', 'iterating'), entry('b')]
    expect(nextActiveId(prev, next, 'a')).toBe('a')
  })

  it('stays across an iterating-to-pending rev bump (golden)', () => {
    const prev = [entry('a', 'iterating', 1), entry('b')]
    const next = [entry('a', 'pending', 2), entry('b')]
    expect(nextActiveId(prev, next, 'a')).toBe('a')
  })

  it('does not yank the user off a manually selected done plan on an unrelated frame (edge)', () => {
    const prev = [entry('a', 'done'), entry('b')]
    const next = [entry('a', 'done'), entry('b'), entry('c')]
    expect(nextActiveId(prev, next, 'a')).toBe('a')
  })

  it('returns null when the active plan was the last pending one (edge)', () => {
    const prev = [entry('a', 'done'), entry('b')]
    const next = [entry('a', 'done'), entry('b', 'done')]
    expect(nextActiveId(prev, next, 'b')).toBeNull()
  })

  it('falls back to the first pending when the active id vanished (error)', () => {
    const prev = [entry('gone'), entry('a', 'done'), entry('b')]
    const next = [entry('a', 'done'), entry('b')]
    expect(nextActiveId(prev, next, 'gone')).toBe('b')
  })

  it('falls back to the first pending when nothing is active (error)', () => {
    expect(nextActiveId([], [entry('a')], null)).toBe('a')
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

describe('relativeTime', () => {
  const MIN = 60_000
  const HOUR = 60 * MIN
  const DAY = 24 * HOUR

  it('reports under a minute as just now (golden)', () => {
    expect(relativeTime(100_000, 100_000 - 30_000)).toBe('just now')
  })

  it('reports whole minutes, hours, and days (golden)', () => {
    expect(relativeTime(DAY * 10, DAY * 10 - 5 * MIN)).toBe('5m ago')
    expect(relativeTime(DAY * 10, DAY * 10 - 3 * HOUR)).toBe('3h ago')
    expect(relativeTime(DAY * 10, DAY * 10 - 2 * DAY)).toBe('2d ago')
  })

  it('rolls over exactly at each bucket boundary (edge)', () => {
    expect(relativeTime(DAY * 10, DAY * 10 - MIN)).toBe('1m ago')
    expect(relativeTime(DAY * 10, DAY * 10 - HOUR)).toBe('1h ago')
    expect(relativeTime(DAY * 10, DAY * 10 - DAY)).toBe('1d ago')
  })

  it('treats a future timestamp (clock skew) as just now (error)', () => {
    expect(relativeTime(100_000, 200_000)).toBe('just now')
  })
})

describe('unseenRevs', () => {
  it('flags an entry whose rev moved past the last-seen rev (golden)', () => {
    const seen = new Map([['a', 1]])
    expect(unseenRevs([entry('a', 'pending', 2)], seen, null)).toEqual(new Set(['a']))
  })

  it('never flags the active entry: the user is looking at it (golden)', () => {
    const seen = new Map([['a', 1]])
    expect(unseenRevs([entry('a', 'pending', 2)], seen, 'a')).toEqual(new Set())
  })

  it('does not flag a never-seen entry at rev 1: it is a brand-new row, not an update (edge)', () => {
    expect(unseenRevs([entry('a')], new Map(), null)).toEqual(new Set())
  })

  it('flags a never-seen entry already past rev 1 (edge)', () => {
    expect(unseenRevs([entry('a', 'pending', 2)], new Map(), null)).toEqual(new Set(['a']))
  })

  it('does not flag an entry at its last-seen rev (edge)', () => {
    const seen = new Map([['a', 2]])
    expect(unseenRevs([entry('a', 'pending', 2)], seen, null)).toEqual(new Set())
  })

  it('returns an empty set for an empty queue (error)', () => {
    expect(unseenRevs([], new Map(), null)).toEqual(new Set())
  })
})

describe('revisingCount', () => {
  it('counts iterating entries (golden)', () => {
    expect(revisingCount([entry('a', 'iterating'), entry('b'), entry('c', 'iterating')])).toBe(2)
  })

  it('is zero when nothing is iterating (edge)', () => {
    expect(revisingCount([entry('a'), entry('b', 'done')])).toBe(0)
  })

  it('is zero for an empty queue (error)', () => {
    expect(revisingCount([])).toBe(0)
  })
})

describe('hasNewActivity', () => {
  const at = (
    id: string,
    status: QueueEntry['status'] = 'pending',
    iteration?: number,
  ): QueueEntry => ({
    id,
    title: `Plan ${id}`,
    dir: 'proj',
    status,
    iteration,
  })

  it('flags an added plan (golden)', () => {
    expect(hasNewActivity([at('a')], [at('a'), at('b')])).toBe(true)
  })

  it('flags a status change on an existing plan (golden)', () => {
    expect(hasNewActivity([at('a', 'pending')], [at('a', 'done')])).toBe(true)
  })

  it('flags a version bump on a requeued plan (golden)', () => {
    expect(hasNewActivity([at('a', 'pending', 2)], [at('a', 'pending', 3)])).toBe(true)
  })

  it('flags a rev bump on an in-place revision (golden)', () => {
    const before = { ...at('a', 'pending'), rev: 1 }
    const after = { ...at('a', 'pending'), rev: 2 }
    expect(hasNewActivity([before], [after])).toBe(true)
  })

  it('does not flag an unchanged queue (edge)', () => {
    expect(hasNewActivity([at('a'), at('b')], [at('a'), at('b')])).toBe(false)
  })

  it('does not flag a plan only being removed (edge)', () => {
    expect(hasNewActivity([at('a'), at('b')], [at('a')])).toBe(false)
  })
})
