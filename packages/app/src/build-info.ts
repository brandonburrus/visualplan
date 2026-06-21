import { execSync } from 'node:child_process'

/**
 * The released semver version shown in the footer. Resolved once at build (server side; only the
 * static Footer imports it, so no git call ships to the browser). A release build has
 * GITHUB_REF_NAME set to the version tag; a branch deploy or local build falls back to the most
 * recent version tag via `git describe`. The docs workflow checks out with tags (`fetch-depth: 0`)
 * so this resolves in CI; tags in this repo are bare semver, no leading `v`.
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

/** Keep a value only if it looks like a semver version (e.g. "0.8.1"). */
function asVersion(value: string | null | undefined): string | null {
  return value && /^\d+\.\d+\.\d+/.test(value) ? value : null
}

export const buildInfo = {
  /** The released semver version: the CI tag on a release, else the most recent version tag. */
  version: asVersion(process.env.GITHUB_REF_NAME) ?? asVersion(git('describe --tags --abbrev=0')),
}
