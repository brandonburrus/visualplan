import { defineConfig, type Options } from 'tsup'

// @visualplan/core and @visualplan/compile are private workspace packages (devDependencies), so
// bundle them into dist for the Node check/render/API path (including core's `/share` subpath and
// compile's `/file-icons` subpath). The regex covers the subpaths, which a bare string would miss.
// Their third-party deps (rehype-expressive-code, material-icon-theme, remark-*, ...) stay external
// and ship as the CLI's own dependencies. Vite resolves core separately at render time via the
// vendored alias in compile.ts.
const shared: Options = {
  format: ['esm'],
  sourcemap: true,
  outDir: 'dist',
  noExternal: [/^@visualplan\/(core|compile)/],
}

// Two entries cannot share one pass: the CLI bin needs the `#!/usr/bin/env node` shebang, which
// would be a stray line at the top of the importable library, and the library needs `.d.ts` types
// the bin does not. The CLI config cleans dist first; the library config must not (it would wipe
// the bin). tsup builds array configs in order, so the clean happens before the library is written.
export default defineConfig([
  {
    ...shared,
    entry: ['src/index.ts'],
    dts: false,
    clean: true,
    banner: { js: '#!/usr/bin/env node' },
  },
  {
    ...shared,
    entry: ['src/api.ts'],
    // Inline the @visualplan/core types into the declaration. Without `resolve`, tsup leaves the
    // catalog re-exports as `from '@visualplan/core'`, a private workspace package a consumer's
    // node_modules will not have, so the types would fail to resolve. Scope it to @visualplan so
    // third-party types (zod, etc.) stay as ordinary external imports.
    dts: { resolve: [/^@visualplan\//] },
    clean: false,
  },
])
