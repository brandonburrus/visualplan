import { execSync } from 'node:child_process'

/**
 * Build-time provenance shown in the footer: the exact source the docs were generated from.
 * Prefers the values GitHub Actions injects (so the deployed site is stamped correctly even on a
 * shallow checkout) and falls back to local git for dev builds. Evaluated once at build, server
 * side only, because only Footer.astro (static) imports it, so no git call ships to the browser.
 */
function git(args: string): string | null {
  try {
    return (
      execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim() || null
    )
  } catch {
    return null
  }
}

const sha = process.env.GITHUB_SHA ?? git('rev-parse HEAD')
const refName = process.env.GITHUB_REF_NAME
// A release build is tagged with a bare-semver version; take it from an exact tag at HEAD, or from
// the CI ref name when it looks like a version (a release event sets it to the tag).
const version =
  git('describe --tags --exact-match') ?? (refName && /^\d/.test(refName) ? refName : null)

export const buildInfo = {
  /** Short commit hash, or null outside a git checkout. */
  shortSha: sha ? sha.slice(0, 7) : null,
  /** Full commit hash, for linking to the commit on GitHub. */
  sha,
  /** The release version, when built from a release tag; otherwise null. */
  version,
}
