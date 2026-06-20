# runtime/

The browser-side React code that renders a compiled MDX plan. It is shipped as **source**
(listed in `package.json` `files`) and compiled at render time by the CLI's Vite build, not
prebuilt. See the root AGENTS.md for why Vite is configured without `@vitejs/plugin-react`.

## How it fits together

- `main.tsx` is the build entry. It imports the user's plan via the `virtual:plan` alias
  (`Plan` default export + `frontmatter` named export from remark-mdx-frontmatter) and calls
  `mount`.
- `index.tsx` defines `mount` and the `components` map auto-injected into MDX via `MDXProvider`.
  No plan ever writes an `import` — every component resolves through this map.
- `Layout.tsx` is page chrome: title/meta header, and a sticky table-of-contents built in a
  `useEffect` by querying the rendered `.vp-phase` elements (it assigns their `id`s too).
- `components/` holds the six components. Each validates its props through `validate.ts`
  against the matching zod schema in `shared/catalog.ts`, throwing a readable, component-named
  error on invalid input (this surfaces in the page and is the render-time half of validation).

## Gotchas

- **Mermaid render ids:** `useId()` returns a string containing `:`, which is not a valid CSS
  selector. `Mermaid.tsx` strips non-alphanumerics before passing the id to `mermaid.render`.
- **`pre` override drives mermaid:** MDX renders a ` ```mermaid ` fence as `<pre><code
  class="language-mermaid">`. The `Pre` component in `index.tsx` intercepts that and renders
  `<Mermaid>`; everything else falls through to a normal `<pre>`.
- **Recharts `Cell` is deprecation-flagged** in recharts 3 but still functional; it is how
  per-bar/slice colors are set. The hint does not fail typecheck.
- **`shared/catalog.ts` must stay isomorphic** (no React/recharts/mermaid) — the Node CLI
  imports it too.
- A side-effect CSS import needs the `*.css` ambient declaration in `css.d.ts`; `virtual:plan`
  needs the ambient module in `virtual-plan.d.ts`.

## Adding a component

1. Add its zod schema, enum constants, and a `CATALOG` entry (with `staticEnums` and an
   example) to `shared/catalog.ts`.
2. Create `components/<Name>.tsx` validating props via `validateProps`.
3. Register it in the `components` map in `index.tsx`.
4. Add it to `templates/example.mdx` and cover it in `tests/components.test.tsx`.
