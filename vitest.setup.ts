/**
 * Test-environment shim for the Web Storage API, loaded by the browser-like (jsdom) projects.
 *
 * Node 26 defines its own `localStorage` global: an accessor that returns `undefined` unless the
 * process was started with `--localstorage-file`. Vitest's jsdom environment copies jsdom's window
 * onto `globalThis` but skips keys that already exist there, so Node's inert accessor wins and
 * jsdom's working `localStorage` is never installed. Reads then throw
 * (`Cannot read properties of undefined`), breaking any browser-like test that touches storage.
 * `sessionStorage` is unaffected, because Node's own is already a working object.
 *
 * Install an in-memory Storage in its place so the jsdom projects get the API a browser provides.
 * This is a no-op wherever a real `localStorage` already exists.
 */

/** The `Storage` surface the Web Storage API guarantees. */
interface WebStorage {
  readonly length: number
  clear(): void
  getItem(key: string): string | null
  key(index: number): string | null
  removeItem(key: string): void
  setItem(key: string, value: string): void
}

/** An in-memory `Storage`, with the spec's string coercion and insertion-order keys. */
class MemoryStorage implements WebStorage {
  private readonly entries = new Map<string, string>()

  get length(): number {
    return this.entries.size
  }

  clear(): void {
    this.entries.clear()
  }

  getItem(key: string): string | null {
    return this.entries.get(String(key)) ?? null
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.entries.delete(String(key))
  }

  setItem(key: string, value: string): void {
    this.entries.set(String(key), String(value))
  }
}

function installLocalStorage(target: object): void {
  if ((target as { localStorage?: unknown }).localStorage != null) return
  Object.defineProperty(target, 'localStorage', {
    configurable: true,
    writable: true,
    value: new MemoryStorage(),
  })
}

const targets = new Set<object>([globalThis])
const window = (globalThis as { window?: object }).window
if (window) targets.add(window)
for (const target of targets) installLocalStorage(target)
