// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CATALOG } from '@visualplan/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as api from '../src/api.js'
import { InvalidPlanError, check, render } from '../src/api.js'
import { checkPlan } from '../src/build/check.js'

const VALID_PLAN = '# A plan\n\n<Phase title="Build">\n  1. Do the thing\n</Phase>\n'
const INVALID_PLAN = '# Bad\n\n<Phase status="nope">x</Phase>\n'

let workDir: string

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'visualplan-api-test-'))
})

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true })
})

describe('render', () => {
  let html: string
  let written: string

  beforeAll(async () => {
    const out = join(workDir, 'plan.html')
    html = await render(VALID_PLAN, { out })
    written = await readFile(out, 'utf8')
  }, 60_000)

  it('returns a self-contained HTML string with the mount root (golden)', () => {
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('id="root"')
    // singlefile inlines the JS and CSS; assert the positive (a text scan for external
    // tags false-positives on JS string literals in the bundle).
    expect(html).toMatch(/<script type="module"[^>]*>\s*\S/)
    expect(html).toMatch(/<style[^>]*>\s*\S/)
  })

  it('writes the same HTML to the out path when given one (golden)', () => {
    expect(written).toBe(html)
  })

  it('throws InvalidPlanError carrying the issues for an invalid plan (error)', async () => {
    await expect(render(INVALID_PLAN)).rejects.toBeInstanceOf(InvalidPlanError)
    const error = await render(INVALID_PLAN).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(InvalidPlanError)
    expect((error as InvalidPlanError).issues).toHaveLength(1)
    expect((error as InvalidPlanError).issues[0].message).toContain('status="nope"')
  })

  it('renders an effectively empty plan without throwing (edge)', async () => {
    const empty = await render('   \n')
    expect(empty).toContain('<!doctype html>')
    expect(empty).toContain('id="root"')
  }, 60_000)
})

describe('check', () => {
  it('returns no issues for a valid plan (golden)', async () => {
    expect(await check(VALID_PLAN)).toEqual([])
  })

  it('returns issues with a line and column for an invalid plan (error)', async () => {
    const issues = await check(INVALID_PLAN)
    expect(issues).toHaveLength(1)
    expect(issues[0].line).toBeGreaterThan(0)
    expect(issues[0].column).toBeGreaterThan(0)
    expect(issues[0].message).toContain('status="nope"')
  })

  it('matches the file-based checkPlan on the same source (edge)', async () => {
    const path = join(workDir, 'parity.mdx')
    await writeFile(path, INVALID_PLAN)
    expect(await check(INVALID_PLAN)).toEqual(await checkPlan(path))
  })
})

describe('catalog entry exports', () => {
  it('exposes a component descriptor with its static enums (golden)', () => {
    expect(api.chart.name).toBe('Chart')
    expect(api.chart.staticEnums.type).toContain('bar')
    expect(api.phase.staticEnums.status).toContain('planned')
  })

  it('exports every CATALOG entry under a named export (regression)', () => {
    // CATALOG is composed from the named consts, so each entry must be reachable as an export.
    const exported = new Set(Object.values(api as Record<string, unknown>))
    for (const entry of CATALOG) {
      expect(exported.has(entry)).toBe(true)
    }
  })
})
