// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readSnapshot, snapshotPath, writeSnapshot } from '../src/build/snapshots.js'

describe('snapshot cache', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vplan-snap-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('round-trips the cached source for a plan path', async () => {
    await writeSnapshot('/plans/feature.mdx', '# Feature\n', dir)
    expect(await readSnapshot('/plans/feature.mdx', dir)).toBe('# Feature\n')
  })

  it('returns undefined for a path with no snapshot (a first look)', async () => {
    expect(await readSnapshot('/plans/never-seen.mdx', dir)).toBeUndefined()
  })

  it('keys distinct paths to distinct files but is stable for one path', async () => {
    expect(snapshotPath('/a/one.mdx', dir)).toBe(snapshotPath('/a/one.mdx', dir))
    expect(snapshotPath('/a/one.mdx', dir)).not.toBe(snapshotPath('/a/two.mdx', dir))
  })

  it('overwrites a prior snapshot so the diff means "since you last looked"', async () => {
    await writeSnapshot('/plans/p.mdx', 'v1', dir)
    await writeSnapshot('/plans/p.mdx', 'v2', dir)
    expect(await readSnapshot('/plans/p.mdx', dir)).toBe('v2')
  })

  it('does not throw when the cache directory cannot be created (best-effort write)', async () => {
    // Point the store at a path under a regular file, so mkdir fails; the write must swallow it.
    const file = join(dir, 'not-a-dir')
    await writeFile(file, 'x')
    await expect(
      writeSnapshot('/plans/p.mdx', 'data', join(file, 'snapshots')),
    ).resolves.toBeUndefined()
  })
})
