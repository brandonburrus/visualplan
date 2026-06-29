/**
 * `vplan open` — open the Review Queue tab, starting the background daemon if it is not already
 * running. Unlike `render --review` / `review`, it enqueues no plan and does not block: it just
 * ensures the daemon (a detached process) is up and opens its shell at `/`, so the user can open or
 * re-open the queue tab on its own. Reviews launched afterward join this tab.
 *
 * Takes injectable `deps` so the wiring is unit-tested without a real daemon or browser.
 */
import open from 'open'
import { readConfig } from '../config.js'
import { ensureDaemon } from '../review/ensure-daemon.js'

export interface OpenOptions {
  /** `--no-open`: start the daemon and print the URL without launching a browser. */
  open?: boolean
}

export interface OpenDeps {
  ensureDaemon: (idleMs: number) => Promise<{ port: number }>
  openBrowser: (url: string) => Promise<void>
  stdout: NodeJS.WriteStream
}

function realDeps(): OpenDeps {
  return {
    ensureDaemon: idleMs => ensureDaemon({ idleMs }),
    openBrowser: async url => {
      await open(url)
    },
    stdout: process.stdout,
  }
}

export async function runOpen(
  options: OpenOptions = {},
  deps: OpenDeps = realDeps(),
): Promise<void> {
  const { daemonTimeout } = await readConfig()
  const { port } = await deps.ensureDaemon(daemonTimeout)
  const url = `http://localhost:${port}/`
  deps.stdout.write(`Review Queue at\n  ${url}\n`)
  if (options.open !== false) await deps.openBrowser(url)
}
