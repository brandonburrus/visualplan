---
layout: ../../layouts/Docs.astro
title: Exporting
description: Render a plan to a static PDF or JPG.
---

# Exporting

The default output of `vplan` is an interactive HTML page. When you need a static artifact to attach
to a ticket, drop in a doc, email, or print, export the plan to a **PDF** or a **JPG** instead:

```bash
vplan export pdf plan.mdx    # paginated A4 document -> plan.pdf
vplan export jpg plan.mdx    # one full-page hi-dpi image -> plan.jpg
```

Export builds the exact same self-contained page the HTML render produces, then captures it with a
headless Chromium, so the output is the fully rendered plan, diagrams, charts, and typeset math
included, not a degraded copy. The file is written next to the source (`<file>.pdf` / `<file>.jpg`)
and opened.

## Formats

- **`pdf`** prints a paginated A4 document, so a long plan flows across pages and prints cleanly.
- **`jpg`** captures a single full-page, high-DPI screenshot of the whole plan, best for a preview
  thumbnail or pasting an image inline.

## Flags

| Flag | Effect |
|------|--------|
| `--out <path>` | Write to `<path>` instead of `<file>.<pdf\|jpg>`. Required when reading from stdin. |
| `--theme <theme>` | Override the baked color scheme: `light`, `dark`, or `system`. |
| `--browser <path>` | Render with a specific Chromium binary instead of auto-discovering one. |
| `--no-open` | Do not open the exported file. |

The plan can come from a file, `-`, or piped stdin; when the input is stdin there is no source name
to derive an output from, so `--out` is required.

## Chromium

Export needs a Chromium to render the page. It is sourced without bundling a browser, so the CLI
stays small:

1. A system Chrome or Edge, if one is installed.
2. Otherwise a `playwright`-installed Chromium.

If neither is found, the command stops and tells you to run `npx playwright install chromium`. You
can also point it at a specific binary with `--browser <path>` or the `VPLAN_CHROMIUM` environment
variable.

## Which output should I use?

| Goal | Use |
|------|-----|
| Read, review, or interact with the plan | the HTML render (`vplan plan.mdx`) |
| Get a sign-off decision | [review mode](/docs/review/) (`--review`) |
| Send a link with nothing to install | [share](/docs/cli/#share) (`vplan share`) |
| Attach a static file to a ticket, doc, or email | **export** (`vplan export`) |

See the [CLI reference](/docs/cli/#export) for the command in the context of every other flag.
