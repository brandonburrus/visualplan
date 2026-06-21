import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  banner: { js: '#!/usr/bin/env node' },
  // @visualplan/core and @visualplan/compile are private workspace packages
  // (devDependencies), so bundle them into dist for the Node check/render path (including
  // core's `/share` subpath and compile's `/file-icons` subpath). The regex covers the
  // subpaths, which a bare string would miss. Their third-party deps (rehype-expressive-code,
  // material-icon-theme, remark-*, ...) stay external and ship as the CLI's own dependencies.
  // Vite resolves core separately at render time via the vendored alias in compile.ts.
  noExternal: [/^@visualplan\/(core|compile)/],
})
