---
layout: ../../layouts/Docs.astro
title: CLI reference
description: Every vplan command and flag.
---

# CLI reference

`vplan` is the CLI that renders a plan `.mdx` file to a self-contained HTML page. Install it with
`npm i -g vplan` (see [Installation](/docs/install/)).

## render

```bash
vplan <file.mdx>
```

Compiles a plan to a single self-contained `<file>.plan.html` next to the source and opens it.
`render` is the default command, so `vplan plan.mdx` and `vplan render plan.mdx` are the same.

| Flag | Effect |
|------|--------|
| `--watch` | Start a hot-reloading dev server instead of writing a file. Long-running; stops on Ctrl+C. |
| `--out <path>` | Write the HTML to `<path>` instead of `<file>.plan.html`. |
| `--no-open` | Do not open the result in the browser. |

`--watch` serves a local URL and writes no file, so for a one-shot HTML output use the plain
render, not `--watch`.

## check

```bash
vplan check <file.mdx>
```

Validates a plan without rendering it, the self-correction loop. It reports MDX compile errors
plus static component checks as `file:line:col`, naming the valid values for bad enums and flagging
unknown components. It also validates each mermaid diagram and math block, and rejects markdown
images (which would break the self-contained output).

Run `check` before showing a plan to a user, so they never see a broken render.

## components

```bash
vplan components
```

Prints the component vocabulary cheat-sheet with the exact prop signatures. See
[Authoring plans](/docs/authoring/) for the full guide.

## Exit codes

- `0`, success (rendered, or `check` found no issues).
- Non-zero, a compile error or a `check` failure. The reported `file:line:col` issues are printed
  to stderr.
