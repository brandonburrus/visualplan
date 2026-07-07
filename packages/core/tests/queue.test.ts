import { describe, expect, it } from 'vitest'
import { QUEUE_STATUS_VALUES, queueEntrySchema } from '../src/index.js'

describe('queueEntrySchema', () => {
  it('parses a full entry and keeps its fields (golden)', () => {
    const entry = { id: 'p-1', title: 'Review Queue', dir: 'visualplan', status: 'active' }
    expect(queueEntrySchema.parse(entry)).toEqual({ ...entry, rev: 1 })
  })

  it('defaults status to pending when omitted (edge)', () => {
    const parsed = queueEntrySchema.parse({ id: 'p-1', title: 'Plan', dir: 'proj' })
    expect(parsed.status).toBe('pending')
  })

  it('rejects an empty id or an unknown status (error)', () => {
    expect(() => queueEntrySchema.parse({ id: '', title: 'Plan', dir: 'proj' })).toThrow()
    expect(() =>
      queueEntrySchema.parse({ id: 'p-1', title: 'Plan', dir: 'proj', status: 'archived' }),
    ).toThrow()
  })

  it('allows an empty title and dir for an untitled plan from the cwd (edge)', () => {
    // A plan need not start with a heading mid-compose, and the cwd basename can be empty at root;
    // neither should block enqueueing, so only id and status are constrained.
    const parsed = queueEntrySchema.parse({ id: 'p-1', title: '', dir: '' })
    expect(parsed).toEqual({ id: 'p-1', title: '', dir: '', status: 'pending', rev: 1 })
  })

  it('exposes the four sidebar statuses (golden)', () => {
    expect(QUEUE_STATUS_VALUES).toEqual(['pending', 'active', 'done', 'iterating'])
  })

  it('defaults rev to 1 for frames from an older daemon (edge)', () => {
    expect(queueEntrySchema.parse({ id: 'p-1', title: 'P', dir: 'd' }).rev).toBe(1)
  })

  it('carries rev, iterating status, and timestamps for an in-place re-review (golden)', () => {
    const parsed = queueEntrySchema.parse({
      id: 'p-1',
      title: 'Plan',
      dir: 'proj',
      status: 'iterating',
      rev: 3,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_060_000,
    })
    expect(parsed.status).toBe('iterating')
    expect(parsed.rev).toBe(3)
    expect(parsed.createdAt).toBe(1_700_000_000_000)
    expect(parsed.updatedAt).toBe(1_700_000_060_000)
  })

  it('rejects a zero or negative rev (error)', () => {
    expect(() => queueEntrySchema.parse({ id: 'p-1', title: 'P', dir: 'd', rev: 0 })).toThrow()
  })

  it('carries an optional iteration and decision for re-reviews (golden)', () => {
    const parsed = queueEntrySchema.parse({
      id: 'p-1',
      title: 'Plan',
      dir: 'proj',
      status: 'done',
      iteration: 2,
      decision: 'deny',
    })
    expect(parsed.iteration).toBe(2)
    expect(parsed.decision).toBe('deny')
  })

  it('rejects a zero/negative iteration or an unknown decision (error)', () => {
    expect(() =>
      queueEntrySchema.parse({ id: 'p-1', title: 'P', dir: 'd', iteration: 0 }),
    ).toThrow()
    expect(() =>
      queueEntrySchema.parse({ id: 'p-1', title: 'P', dir: 'd', decision: 'maybe' }),
    ).toThrow()
  })
})
