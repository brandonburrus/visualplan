import { deflateSync, Inflate, inflateSync, strFromU8, strToU8 } from 'fflate'

/**
 * Codec for the stateless plan-share URL (`?data=`). A plan's MDX source is
 * deflated and base64url-encoded so the entire plan travels inside a link with
 * no server and no storage; the `/view` page reverses it to recompile the plan
 * in the browser.
 *
 * Isomorphic on purpose: the CLI encodes at render time (Node) and `/view`
 * decodes (browser), so both sides share one format and cannot drift. It is
 * intentionally NOT re-exported from the core index, so the vendored runtime
 * render path stays free of `fflate`; import it as `@visualplan/core/share`.
 *
 * base64url is implemented here rather than via `btoa`/`atob` so the module
 * needs neither the DOM lib (which would pollute this isomorphic package) nor
 * `Buffer` (Node-only), and so it cannot clash with a consumer's global typings.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

// Reverse map: char code -> 6-bit value, with -1 for any byte outside the alphabet.
const DECODE = (() => {
  const table = new Int16Array(128).fill(-1)
  for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i
  return table
})()

function bytesToBase64Url(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 3 <= bytes.length; i += 3) {
    const n =
      ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8) | (bytes[i + 2] as number)
    out += ALPHABET[(n >>> 18) & 63]
    out += ALPHABET[(n >>> 12) & 63]
    out += ALPHABET[(n >>> 6) & 63]
    out += ALPHABET[n & 63]
  }
  const remaining = bytes.length - i
  if (remaining === 1) {
    const n = (bytes[i] as number) << 16
    out += ALPHABET[(n >>> 18) & 63]
    out += ALPHABET[(n >>> 12) & 63]
  } else if (remaining === 2) {
    const n = ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8)
    out += ALPHABET[(n >>> 18) & 63]
    out += ALPHABET[(n >>> 12) & 63]
    out += ALPHABET[(n >>> 6) & 63]
  }
  return out
}

function sextet(data: string, index: number): number {
  const code = data.charCodeAt(index)
  const value = code < 128 ? (DECODE[code] as number) : -1
  if (value < 0) throw new Error('invalid base64url character')
  return value
}

function base64UrlToBytes(data: string): Uint8Array {
  const groups = Math.floor(data.length / 4)
  const remainder = data.length - groups * 4
  // A single trailing char can never be a valid base64 group (it carries < 6 usable bits).
  if (remainder === 1) throw new Error('invalid base64url length')
  const byteLength = groups * 3 + (remainder === 0 ? 0 : remainder - 1)
  const bytes = new Uint8Array(byteLength)
  let bi = 0
  let i = 0
  for (let g = 0; g < groups; g++) {
    const n =
      (sextet(data, i) << 18) |
      (sextet(data, i + 1) << 12) |
      (sextet(data, i + 2) << 6) |
      sextet(data, i + 3)
    bytes[bi++] = (n >>> 16) & 0xff
    bytes[bi++] = (n >>> 8) & 0xff
    bytes[bi++] = n & 0xff
    i += 4
  }
  if (remainder === 2) {
    const n = (sextet(data, i) << 18) | (sextet(data, i + 1) << 12)
    bytes[bi++] = (n >>> 16) & 0xff
  } else if (remainder === 3) {
    const n = (sextet(data, i) << 18) | (sextet(data, i + 1) << 12) | (sextet(data, i + 2) << 6)
    bytes[bi++] = (n >>> 16) & 0xff
    bytes[bi++] = (n >>> 8) & 0xff
  }
  return bytes
}

/** Encode a plan's MDX source into the URL-safe `?data=` payload. */
export function encodePlan(mdx: string): string {
  return bytesToBase64Url(deflateSync(strToU8(mdx), { level: 9 }))
}

/** Thrown by `decodePlan` when a payload decompresses past `maxBytes`. Distinct from a corrupt
 * payload so `/view` can tell "this plan is too big" apart from "this link could not be read". */
export class PlanTooLargeError extends Error {
  constructor() {
    super('plan exceeds the maximum decoded size')
    this.name = 'PlanTooLargeError'
  }
}

/** Compressed input is fed to the bounded inflater in slices so output stays incremental. */
const INFLATE_CHUNK_BYTES = 8192

/**
 * Inflate with an output ceiling. The `?data=` payload is untrusted, and DEFLATE can expand a tiny
 * input by ~1000x, so a naive `inflateSync` could let a crafted link allocate gigabytes before any
 * length check. Feeding the input in slices keeps each emitted chunk small, and the first chunk that
 * pushes the running total past `maxBytes` aborts the decode (throwing `PlanTooLargeError`), so a
 * bomb never fully materializes. Throws on invalid deflate data as well.
 */
function inflateBounded(bytes: Uint8Array, maxBytes: number): Uint8Array {
  const chunks: Uint8Array[] = []
  let total = 0
  const inflater = new Inflate(chunk => {
    total += chunk.length
    if (total > maxBytes) throw new PlanTooLargeError()
    chunks.push(chunk)
  })
  for (let offset = 0; offset < bytes.length; offset += INFLATE_CHUNK_BYTES) {
    const end = Math.min(offset + INFLATE_CHUNK_BYTES, bytes.length)
    inflater.push(bytes.subarray(offset, end), end === bytes.length)
  }
  const out = new Uint8Array(total)
  let written = 0
  for (const chunk of chunks) {
    out.set(chunk, written)
    written += chunk.length
  }
  return out
}

/**
 * Decode a `?data=` payload back to the plan's MDX source. Throws if the payload
 * is not valid base64url or not valid deflate data, so callers can show a
 * friendly error for a corrupted or truncated link.
 *
 * Pass `maxBytes` for untrusted input (the `/view` page): the decode is then bounded and aborts
 * with `PlanTooLargeError` rather than letting a decompression bomb exhaust memory. Omit it for the
 * trusted round-trip, where the unbounded `inflateSync` is simplest.
 */
export function decodePlan(data: string, maxBytes?: number): string {
  const bytes = base64UrlToBytes(data)
  if (maxBytes === undefined) return strFromU8(inflateSync(bytes))
  return strFromU8(inflateBounded(bytes, maxBytes))
}
