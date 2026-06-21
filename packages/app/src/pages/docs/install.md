---
layout: ../../layouts/Docs.astro
title: Installation
description: Install the visual-plan agent skill and the vplan CLI.
---

# Installation

VisualPlan has two pieces: the **skill** that teaches your agent to author plans, and the **CLI**
that renders them. Install both.

## The agent skill

Installs the `visual-plan` skill into your coding agent so it authors plans visually:

```bash
npx skills add brandonburrus/visualplan
```

This works with any agent that supports the [skills](https://skills.sh) format, Claude Code,
Cursor, Codex, and others.

## The CLI

The skill renders plans with `vplan`, so install it too (the skill will prompt for this if it is
missing):

```bash
npm i -g vplan
```

Or run it without installing:

```bash
npx vplan plan.mdx
```

## Requirements

- **Node.js 20 or newer.** The CLI compiles the plan with Vite at render time.
- A browser to view the output (the render opens it for you; pass `--no-open` to skip).

## Verify

Render the built-in example to confirm everything works:

```bash
vplan components   # prints the component vocabulary cheat-sheet
```

If `vplan` is not found after a global install, make sure your npm global `bin` directory is on
your `PATH`, or use `npx vplan` instead.
