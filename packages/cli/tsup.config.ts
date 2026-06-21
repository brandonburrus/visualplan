import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  banner: { js: '#!/usr/bin/env node' },
  // @visualplan/core is a private workspace package (a devDependency), so bundle
  // it into dist for the Node check/components path (and its `/share` subpath used
  // by compile.ts). The regex covers the subpath, which a bare string would miss.
  // Vite resolves core separately at render time via the vendored alias in compile.ts.
  noExternal: [/^@visualplan\/core/],
})
