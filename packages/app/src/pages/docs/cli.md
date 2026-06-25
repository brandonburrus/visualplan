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
`render` is the default command, so `vplan plan.mdx` and `vplan render plan.mdx` are the same. The
file argument may be `-` (or omitted) to read the plan from stdin.

| Flag | Effect |
|------|--------|
| `--watch` | Start a hot-reloading dev server instead of writing a file. Long-running; stops on Ctrl+C. |
| `--port <number>` | Port for the `--watch` dev server (default `9140`, auto-incrementing if taken). |
| `--out <path>` | Write the HTML to `<path>` instead of `<file>.plan.html`. |
| `--stdout` | Write the rendered HTML to stdout instead of a file (composes in a pipeline; never auto-diffs). |
| `--review` | Open an interactive review session and block until the reviewer decides (see below). |
| `-i, --iteration <n>` | Plan revision number shown in the review bar; increment it each re-review. |
| `--timeout <duration>` | Max wait for review feedback, e.g. `15m`, `30s`, `1h` (default `15m`). |
| `--diff <path>` | Diff this render against an explicit baseline plan, overriding the snapshot cache. |
| `--no-diff` | Skip iteration diffing (do not read or write the snapshot cache). |
| `--no-open` | Do not open the result in the browser. |

`--watch` serves a local URL and writes no file, so for a one-shot HTML output use the plain
render, not `--watch`.

### Review mode

`vplan render --review <file.mdx>` opens the plan as an interactive review session: the reviewer
comments on sections or selected text, answers any `<Questions>` inline, then clicks Approve, Deny,
or Iterate. The command **blocks** until they submit, prints the decision, comments, and answers to
stdout, then exits with a decision-specific code (see [Exit codes](#exit-codes)). It is a
long-running foreground server; a closed tab counts as Deny, and `--timeout` bounds the wait. See
[Review mode](/docs/review/) for an interactive demo and the full session walkthrough.

### Iteration diffing

A render of a plan **file** snapshots its source (under `~/.vplan/snapshots`, keyed by absolute
path), and the next render of that path diffs the new source against the snapshot, marking
added and edited sections git-gutter style with an "N changed" summary so the reviewer re-reviews
only the delta. Diffing applies to `render`, `--watch`, and `--review`; a `--stdout` render never
auto-diffs (it stays deterministic for pipelines). Use `--diff <path>` to force an explicit baseline
without touching the cache, or `--no-diff` to opt out (for example a clean first look).

## check

```bash
vplan check <file.mdx>
```

Validates a plan without rendering it, the self-correction loop. It reports MDX compile errors
plus static component checks as `file:line:col`, naming the valid values for bad enums and flagging
unknown components. It also validates each mermaid diagram and math block, and rejects markdown
images (which would break the self-contained output).

Once a plan parses cleanly, `check` also runs an author-time **quality lint** that flags weak
renders before a human sees them: a plan that is all prose with no structure, a `Phase` that is a
wall of prose with no visual, a wide left-to-right mermaid diagram that will shrink to illegibility,
an over-long `Matrix` cell, a `-- comment` on a `FileTree` move row, or a `Chart` whose series
differ wildly in scale. These surface as warnings, and **a warning fails the check** (non-zero exit)
just like an error, so the lint is not advisory. The quality lint runs only on the `check` command;
the programmatic `checkPlan` runs the static checks alone.

Run `check` before showing a plan to a user, so they never see a broken render.

## export

```bash
vplan export <pdf|jpg> <file.mdx>
```

Builds the same self-contained page, then renders it to a static file with a headless Chromium:
`pdf` prints a paginated A4 document, `jpg` a full-page hi-dpi screenshot. The output goes to
`<file>.pdf` / `<file>.jpg` next to the source and opens. See [Exporting](/docs/export/) for when to
reach for it over the HTML page.

| Flag | Effect |
|------|--------|
| `--out <path>` | Write to `<path>` instead of `<file>.<pdf\|jpg>`. Required when reading from stdin. |
| `--theme <theme>` | Override the baked color scheme: `light`, `dark`, or `system`. |
| `--browser <path>` | Render with a specific Chromium binary instead of auto-discovering one. |
| `--no-open` | Do not open the exported file. |

Export needs a Chromium. It uses a system Chrome or Edge if present, then a `playwright`-installed
Chromium; if none is found it tells you to run `npx playwright install chromium`.

## share

```bash
vplan share <file.mdx>
```

Prints a stateless `visualplan.dev/view?data=...` link that encodes the entire plan (its MDX source,
deflate plus base64url) in the URL, so anyone can open the rendered plan with no files, server, or
account. It validates the plan first, so a broken plan is never shared, and reads a file or stdin
(`-`). This is the CLI equivalent of the share button on a rendered page.

## components

```bash
vplan components
```

Prints the component vocabulary cheat-sheet with the exact prop signatures. See
[Authoring plans](/docs/authoring/) for the full guide.

## config

```bash
vplan config            # show the current settings
vplan config get <key>  # print one setting
vplan config set <key> <value>
vplan config path       # print the config file path
```

Views and edits persistent settings stored in `~/.vplan/config.json`. The only setting is `theme`
(`light`, `dark`, or `system`), the default color scheme baked into every rendered plan. The in-page
settings cog overrides this per view in the browser (via `localStorage`) and never writes the file,
so the on-disk default and the in-page override are separate layers.

## Exit codes

- `0`, success (rendered, or `check` found no issues).
- Non-zero, a compile error or a `check` failure (errors or quality-lint warnings). The reported
  `file:line:col` issues are printed to stderr.
- A `--review` session exits by the reviewer's decision: `0` Approve, `1` Deny, `2` Iterate, `3`
  timeout. A closed tab counts as Deny.
