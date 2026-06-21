---
name: release
description: Use this skill when cutting a new release of this repo, when the user types /release or says "cut a release", "ship a new version", "publish the next version", "bump the version and release", or "create the release". Picks the next semver version from the commits since the last release, writes grouped release notes, and creates the GitHub release, which triggers the npm publish workflow. Do not use for editing the publish workflow, committing code, or publishing to npm by hand.
disable-model-invocation: true
argument-hint: "[major|minor|patch|X.Y.Z]"
metadata:
  internal: true
---

## Purpose

Cut a new release of `vplan`: pick the next semver version from the commits since the last
release, write grouped release notes, and create the GitHub release. Creating the release IS
the publish trigger, `gh release create <X.Y.Z>` fires `.github/workflows/publish.yml`, which
publishes `vplan` to npm via OIDC. Do not create the release until the version and notes are
confirmed by the user.

## Critical rules

- **No leading `v`.** Tags, titles, and versions are bare semver (`0.2.0`, never `v0.2.0`).
- **Creating the release publishes to npm.** Confirm the version and notes with the user before
  running `gh release create`. Treat it like a deploy.
- **Do not bump `package.json`.** The workflow sets the published version from the tag
  (`npm version ${GITHUB_REF_NAME#v}`); the repo's version field stays at its baseline. A
  committed bump would diverge from the tag for no benefit.
- **Never release a dirty, unpushed, or red tree.** A release tags the remote `main` HEAD.

## Commits since the last release

```!
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
last=$(gh release list --limit 1 --json tagName --jq '.[0].tagName' 2>/dev/null)
echo "Last release: ${last:-<none>}"
git log ${last:+${last}..}HEAD --pretty=format:'%h %s' 2>/dev/null | head -60
```

## Workflow

```text
- [ ] 1. Preconditions: on main, clean, pushed, green
- [ ] 2. Determine the next version
- [ ] 3. Write the release notes
- [ ] 4. Confirm with the user, then create the release
- [ ] 5. Verify the publish
```

### 1. Preconditions

- On `main`, clean working tree, and `origin/main` up to date. If `main` is ahead, `git push`
  first; the release tags the remote HEAD, so unpushed commits would be missing from it.
- Green build: `pnpm -r typecheck && pnpm test`. The publish workflow runs these too, so a red
  tree fails the publish after the release already exists.

### 2. Determine the next version

- The last release tag and the commits since it are injected above. If empty, get them with
  `gh release list --limit 1` then `git log <last-tag>..HEAD --oneline`.
- If the user passed an argument, honor it: an explicit `X.Y.Z`, or a bump keyword. Otherwise
  pick the bump from the highest-impact commit type present:

| Commits since the last release | Bump | 0.2.0 becomes |
|---|---|---|
| any `feat!:` / `fix!:`, or a `BREAKING CHANGE:` footer | major | 1.0.0 |
| any `feat:` (no breaking) | minor | 0.3.0 |
| only `fix:` / `perf:` / `refactor:` / `docs:` / `chore:` / `ci:` | patch | 0.2.1 |

- Apply the bump to the last released version to get `X.Y.Z`.

### 3. Write the release notes

- Lead with a one-line summary of the release.
- Group commits under `### Features` (`feat`), `### Fixes` (`fix`), and `### Other` (`perf`,
  `refactor`, notable `docs`). Omit pure noise (`chore`, `ci`, merge commits) unless it matters
  to users.
- One bullet per commit: the subject with the conventional prefix stripped. For example
  `fix(theme): stack Compare cards on narrow viewports` becomes `Stack Compare cards on narrow
  viewports`.

### 4. Confirm with the user, then create the release

- Show the user the chosen version and the full notes. Proceed only on explicit confirmation;
  this publishes to npm.
- Create it (bare version, no `v`):

```bash
gh release create <X.Y.Z> --target main --title "<X.Y.Z>" --notes "<notes>"
```

### 5. Verify the publish

- The release triggers `publish.yml`. Watch it: `gh run list --workflow=publish.yml --limit 1`,
  then `gh run view <run-id>` (use `--log-failed` if it fails).
- Confirm it is live: `npm view vplan version` should print `<X.Y.Z>`.

## Gotchas

- **The release is the publish.** There is no separate publish command; `gh release create` is
  what ships to npm. If you only want a draft, use `--draft` and publish it later to trigger.
- **npm rejects a duplicate version.** If a publish run failed but the version already reached
  npm, you cannot republish it; bump to the next patch. Only delete and recreate the same tag
  (`gh release delete <X.Y.Z> --cleanup-tag`) when nothing was published.
- **Pre-1.0 judgment.** The bump table is the default. In `0.x`, a breaking change is often a
  minor bump rather than a jump to `1.0.0`; confirm the version with the user rather than
  auto-applying major.

## Example

Last release `0.2.0`; commits since:

```text
a1b2c3d feat(chart): add stacked bar charts
e4f5g6h fix(theme): correct dark-mode legend contrast
i7j8k9l docs: document the stacked chart option
```

A `feat` is present and nothing is breaking, so the bump is minor: `0.2.0` becomes `0.3.0`.

```bash
gh release create 0.3.0 --target main --title "0.3.0" --notes "$(cat <<'EOF'
Stacked bar charts and a dark-mode contrast fix.

### Features
- Add stacked bar charts

### Fixes
- Correct dark-mode legend contrast

### Other
- Document the stacked chart option
EOF
)"
```
