---
name: visual-plan
description: Use this skill when writing an implementation or design plan that would benefit from visuals instead of a wall of text, especially in plan mode. Authors the plan as an MDX file and renders it to a self-contained HTML page with the `visualplan` CLI, using a fixed component vocabulary (Phase, FileTree, Chart, Compare, Callout, and mermaid diagrams). Use when the user says "make a visual plan", "render this plan", "show me the plan", or asks for a plan with diagrams/charts. Do not use for prose-only notes or when no `visualplan` CLI is available.
---

# Visual Plan

Render a plan as a visual MDX page instead of a wall of text, using the `visualplan` CLI.

## Workflow

1. Write the plan to a `.mdx` file. Start with a `# Title` heading (no frontmatter), then use
   the components below. You never write `import` statements; the components are always in scope.
2. Validate before showing the user: `visualplan check <file>.mdx`. Fix any reported
   `file:line:col` issues (it names the valid values for bad enums and flags unknown components).
3. Render: `visualplan <file>.mdx` opens a self-contained HTML page. Use
   `visualplan <file>.mdx --watch` to iterate live while you refine the plan.

Run `visualplan components` anytime for the exact prop signatures.

## Title

Begin the file with a single `# Heading`; it becomes the plan title. There is no frontmatter.

```mdx
# Add rate limiting to the API
```

## Components

- `<Phase title="..." status="planned|active|done">` — one step in a numbered vertical
  timeline; wraps markdown (ordered lists, prose, nested components). The steps auto-number in
  order. One per major step of the plan.
- ` ```mermaid ` fenced block — diagrams: architecture (`flowchart`), `sequenceDiagram`,
  dependency graphs, `stateDiagram`, `classDiagram`, ER, and XY charts. Reach for this first for
  anything structural. (gantt and pie are not supported; use `<Chart>` for quantitative data.)
- `<FileTree files={[{ path, change }]} />` — file-change map; `change` is `add|modify|delete|move`.
- `<Chart type="bar|line|pie" title="..." data={[{ label, value }]} />` — estimates/metrics.
- `<Compare options={[{ name, pros: [], cons: [], pick: true }]} />` — weigh approaches side by side.
- `<Callout type="note|risk|decision|warn">` — highlight a risk, decision, or note; wraps markdown.
  (`risk` is red, `warn` is yellow.)
- `<Questions items={["...", "..."]} />` — open questions you want the reader to resolve before
  building. Use this instead of burying uncertainties in prose.
- `<Checklist title="Done when" items={[{ text: "...", done: true }]} />` — acceptance criteria /
  definition of done, with done and todo states.
- Fenced code blocks are syntax-highlighted (Expressive Code): write ` ```ts ` (or js, json, bash,
  python, go, rust, sql, yaml, etc.) to show a key snippet. Add a file name with
  ` ```ts title="src/path/file.ts" ` to render a filename header on the block.

## Guidance

- Lead with structure: open with a one-paragraph context, then a mermaid architecture diagram,
  then `<Phase>` sections. Put risks and key decisions in `<Callout>`s, not buried in prose.
- Prefer a diagram or a `<FileTree>` over describing structure in sentences.
- Keep prose tight inside phases; the visual is the point.
- Always `check` before presenting, so the user never sees a broken render.
