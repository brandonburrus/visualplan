// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_DEV_PORT, type DevServer, startDevServer } from '../src/build/compile.js'

let workDir: string
let planPath: string
let server: DevServer

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'visualplan-watch-test-'))
  planPath = join(workDir, 'plan.mdx')
  await writeFile(planPath, '# First\n\ntext\n')
  server = await startDevServer(planPath)
}, 60_000)

afterAll(async () => {
  await server?.close()
  await rm(workDir, { recursive: true, force: true })
})

describe('startDevServer (--watch)', () => {
  it('serves the plan over a local URL (golden)', async () => {
    const html = await (await fetch(server.url)).text()
    expect(html).toContain('id="root"')
  })

  it('defaults to DEFAULT_DEV_PORT when no port is passed (golden)', () => {
    // The shared server has no explicit port, so it binds the default (or the next free port if
    // 9140 is taken). Asserting the host distinguishes the default from Vite's old 5173.
    expect(new URL(server.url).port).toBe(String(DEFAULT_DEV_PORT))
  })

  it('binds an explicitly requested port (edge)', async () => {
    const requested = 9173
    const custom = await startDevServer(planPath, 'system', requested)
    try {
      expect(new URL(custom.url).port).toBe(String(requested))
    } finally {
      await custom.close()
    }
  }, 60_000)

  it('pushes a full-reload over HMR when the watched plan is edited (regression)', async () => {
    // The plan is a virtual module backed by a file, so addWatchFile alone does not invalidate it
    // on save; the plugin's handleHotUpdate must. Assert the browser-facing signal: a full-reload
    // arrives on the HMR socket when the file changes. Without the hook this times out.
    // Load the entry module so it imports virtual:plan into the graph; this exercises the
    // invalidate-the-loaded-module path, not just the unconditional reload.
    await (await fetch(new URL('/main.tsx', server.url))).text()
    const ws = new WebSocket(server.url.replace('http', 'ws'), 'vite-hmr')
    try {
      const reload = new Promise<string>((resolve, reject) => {
        ws.addEventListener('message', event => {
          const message = JSON.parse(String(event.data))
          if (message.type === 'full-reload') resolve(message.type)
        })
        ws.addEventListener('error', () => reject(new Error('HMR socket error')))
      })
      await new Promise(resolve => ws.addEventListener('open', resolve))
      // Re-touch the file on an interval: under parallel test load the fork can be starved and a
      // single chokidar event may be delayed or coalesced, so keep producing changes until the
      // reload arrives. Resolves immediately on an idle machine.
      let tick = 0
      const retouch = setInterval(() => {
        void writeFile(planPath, `# Edit ${++tick}\n\nbody ${tick}\n`)
      }, 2_000)
      try {
        await expect(reload).resolves.toBe('full-reload')
      } finally {
        clearInterval(retouch)
      }
    } finally {
      ws.close()
    }
  }, 60_000)
})
