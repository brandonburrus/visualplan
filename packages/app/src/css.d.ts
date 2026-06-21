// Side-effect CSS imports (e.g. the runtime's theme.css) carry no types; declare them so the
// React islands that import stylesheets typecheck under `astro check`.
declare module '*.css'
