# Static renders and exports

The non-review outputs of `vplan`, for when the user only wants to **look** at a plan (not shape or
decide on it) or wants a **shareable file**. Each opts out of the default interactive review.

Authoring a plan (the components, the show-don't-tell rules, the gotchas) is identical whichever
output you pick; it all lives in the main `SKILL.md`. Always `vplan check <file>.mdx` first.

## Static HTML page (`--static`)

`vplan --static <file>.mdx` writes `<file>.plan.html` next to the source and opens it: a one-shot,
self-contained page with no feedback layer. This is the pre-review default, for when the user just
wants to see the plan.

- `--out <path>` sets the output location (and implies a static render).
- `--stdout` writes the HTML to stdout instead of a file (implies a static render), so it composes in
  a pipeline; a `--stdout` render is deterministic and never auto-diffs.
- `--no-open` suppresses opening the result (reserve for an explicit headless/CI request).

The iteration diff (git-gutter accents marking what changed since the last view) shows on a static
render too, not just in review: `vplan` snapshots each plan it presents, keyed by the file path.
`--diff <baseline.mdx>` diffs against an explicit file; `--no-diff` suppresses it.

## Live-reloading preview (`--watch`)

`vplan --watch <file>.mdx` starts a hot-reloading dev server (default `--port 9140`, auto-incrementing
if taken) and opens it; editing the file live-reloads the page. It needs a real file (not stdin),
writes no file, and runs until Ctrl+C. It is a long-running foreground server, so run it in the
background. Use it while iterating on a plan's visuals before a review.

## PDF / JPG export (`vplan export`)

`vplan export <pdf|jpg> <file>.mdx` builds the same self-contained page, then captures it headless:
`pdf` prints a paginated A4 document, `jpg` a full-page hi-dpi screenshot. Use this when the user
wants a shareable static file rather than the interactive HTML page.

- Output defaults to `<file>.pdf` / `<file>.jpg`; `--out <path>` overrides (and is required for stdin
  input).
- `--theme light|dark|system` overrides the baked color scheme; `--no-open` suppresses opening.
- It needs a Chromium: it uses a system Chrome/Edge or a `playwright`-installed one, with
  `--browser <path>` / `VPLAN_CHROMIUM` overrides, otherwise it prints `npx playwright install
  chromium`.
