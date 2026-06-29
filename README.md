<p align="center">
  <img src="https://raw.githubusercontent.com/brandonburrus/visualplan/main/assets/banner.jpg" alt="Visual Plan: render an AI agent's plans as scannable visual pages instead of walls of text" width="100%">
</p>

Turn an AI agent's implementation and design plans into polished, visual web pages instead of
walls of text. A plan is written as MDX and compiled to a single self-contained HTML page.

**Documentation and live examples: [visualplan.dev](https://visualplan.dev)**

It comes in two parts that work together:

- **`vplan`** is a CLI that renders a plan `.mdx` file to a single self-contained HTML page.
- **`visual-plan`** is an agent skill that teaches any AI agent (Claude Code, Cursor, Codex, and
  others) the plan vocabulary, so it writes visual plans instead of prose.

## Install

### The Skill

Installs the `visual-plan` skill into your coding agent so it authors plans visually:

```bash
npx skills add brandonburrus/visualplan
```

### The CLI

The skill renders plans with `vplan`, so install it too (the skill prompts for this if it is
missing):

```bash
npm i -g vplan
# or run without installing:
npx vplan plan.mdx
```

### Example Plan

<p align="center">
  <img src="https://raw.githubusercontent.com/brandonburrus/visualplan/main/assets/example.jpg" alt="An MDX plan file on the left compiled to a polished rendered plan on the right" width="100%">
</p>

A plan is a single MDX file: a `# Title`, then normal Markdown mixed with a small set of built-in
components like `Phase`, `Chart`, `Compare`, and `FileTree`. `vplan` turns it into one polished,
self-contained page you can open or share.

Browse these example plans rendered live in the browser:

 - [Add rate limiting to the API](https://visualplan.dev/examples/rate-limiting.html)
 - [Zero-downtime migration of the orders table](https://visualplan.dev/examples/schema-migration.html)
 - [Add SSO with OAuth2 and OIDC](https://visualplan.dev/examples/add-sso-auth.html)
 - [Train and ship a churn prediction model](https://visualplan.dev/examples/churn-model.html)
 - [Sev1 incident response runbook](https://visualplan.dev/examples/incident-runbook.html)

### All components

<p align="center">
  <img src="https://raw.githubusercontent.com/brandonburrus/visualplan/main/assets/components.jpg" alt="The component vocabulary: diagrams, charts, code, comparisons, file trees, scorecards, callouts, and checklists" width="100%">
</p>

Plans are built from a small, fixed set of components:

 - ` ```mermaid ` (flowchart, sequence, state, class, ER, and XY diagrams)
 - ` ```math ` (LaTeX, typeset as MathML)
 - `Phase` (timeline/execution/planning steps)
 - `FileTree` (file-change maps)
 - `Chart` (bar, line, area, scatter, radar, gauge, funnel, treemap, and pie graphs, with optional stacking)
 - `Stat` (headline metric cards)
 - `Compare` (option tradeoffs)
 - `Matrix` (scorecards)
 - `Callout` (note/tip/risk/decision/warning)
 - `Questions`
 - `Checklist`
 - syntax-highlighted code blocks with file titles

## Review Mode

<p align="center">
  <img src="https://raw.githubusercontent.com/brandonburrus/visualplan/main/assets/review.jpg" alt="Review mode: comment on any section, answer the plan's questions inline, then Approve, Iterate, or Deny" width="100%">
</p>

Rendering a plan opens an interactive review by default, so you get a decision, not just a view:

```bash
vplan plan.mdx
```

The reviewer comments on any section, answers the plan's open `Questions` inline, and clicks Approve,
Iterate, or Deny. The agent waits for that decision: on Iterate it revises the plan and shows it
again, with what changed highlighted, so you converge on a plan before any code is written.

### Review Queue

<p align="center">
  <img src="https://raw.githubusercontent.com/brandonburrus/visualplan/main/assets/queue.jpg" alt="Review Queue: several plans queued in one browser tab and reviewed one after another" width="100%">
</p>

When you have several plans in flight, queue them into a single tab and review them one after
another, like clearing an inbox: decide a plan and the next one opens. Queue several at once with
`vplan review a.mdx b.mdx ...`.

See the [Review mode guide](https://visualplan.dev/docs/review/) for a live, interactive demo.

## Share a plan

Every rendered plan has a share button that copies a link with the whole plan encoded in it, opened
at [visualplan.dev](https://visualplan.dev). Share a plan with anyone just by sending the URL, no
files to send and no account needed. Run `vplan share plan.mdx` to print the same link from the CLI.

## Documentation

Full docs, guides, and rendered examples live at [visualplan.dev](https://visualplan.dev).
