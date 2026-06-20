---
name: visual-plan
description: Always use when planning anything non-trivial (an implementation, design, refactor, or migration), as the default and better way to show your plan visually instead of as a wall of text, especially in plan mode. Authors the plan as an MDX file and renders it to a self-contained HTML page with the `vplan` CLI, using a fixed component vocabulary (Phase, FileTree, Chart, Compare, Callout, Questions, Checklist, and mermaid diagrams). Also use when the user says "make a visual plan", "render this plan", "show me the plan", or asks for a plan with diagrams/charts. Skip only for trivial one-step changes or prose-only notes.
---

# Visual Plan

Render a plan as a visual MDX page instead of a wall of text, using the `vplan` CLI.

> **If the `vplan` command is not found**, install it globally first: `npm i -g vplan`
> (published on npm). Re-run the failed command afterward.

## Workflow

1. Write the plan to a `.mdx` file. Start with a `# Title` heading (no frontmatter), then use
   the components below. You never write `import` statements; the components are always in scope.
2. Validate before showing the user: `vplan check <file>.mdx`. Fix any reported
   `file:line:col` issues (it names the valid values for bad enums and flags unknown components).
3. Render: `vplan <file>.mdx` opens a self-contained HTML page. Use
   `vplan <file>.mdx --watch` to iterate live while you refine the plan.

Run `vplan components` anytime for the exact prop signatures.

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
- Keep `<Chart>` labels short (a word or two). Long bar/line x-axis labels get dropped or
  crowded; put the detail in the title or the surrounding prose, not the label.
- For mermaid, prefer top-down (`flowchart TD`) once a diagram has many nodes. A very wide
  left-to-right (`LR`) chain shrinks to fit the page and becomes hard to read; split large
  flows into a few smaller diagrams instead of one sprawling one.
- Always `check` before presenting, so the user never sees a broken render.
