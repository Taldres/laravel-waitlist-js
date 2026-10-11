---
name: package-release
description: "Use this skill when preparing a release of @taldres/laravel-waitlist: the version bump, CHANGELOG.md, generated release notes, the publish workflow with npm trusted publishing, tags and release validation. Never publish autonomously."
license: MIT
metadata:
    author: taldres
---

# Package Release

## Primary Goal

Prepare a release the maintainer only has to publish: a version that matches what changed, a passing `pnpm check`, and notes that tell consumers what to do. The version is the tag: `package.json` holds the placeholder `0.0.0-development`, and the workflows set the version from the tag before they check, pack and publish.

## Workflow

1. Read the commits since the last tag and pick the next version by SemVer; before 1.0 a breaking change is a minor.
2. Check the Unreleased section of `CHANGELOG.md` against the changes; `update-changelog` moves the release notes in after publishing. A pre-release does not trigger it, so its changes stay under Unreleased.
3. Run `pnpm check`, and `pnpm pack --dry-run` with `npm version <version> --no-git-tag-version` applied on a scratch copy if you want to see the tarball; do not commit the version.
4. Stop there. The maintainer merges, drafts the GitHub release `v<version>` and publishes it. `release-tarball.yml` takes the version from the tag, checks, packs and attaches the tarball; `publish.yml` does the same and stages the version on npm, where the maintainer approves it with 2FA (the package's Staged Packages tab on npmjs.com, or `npm stage approve <stage-id>`); the trusted publisher there stays stage-only. A pre-release only gets the tarball: `publish.yml` and `update-changelog.yml` run on `released`, which pre-releases do not trigger.

## References

- `.github/workflows/publish.yml`, `.github/workflows/release-tarball.yml`, `.github/workflows/update-changelog.yml`, `.github/release.yml`

## Anti-Patterns

- Running `pnpm publish`, approving a staged version, creating tags or GitHub releases without the maintainer asking.
- Adding an npm token to the repository instead of trusted publishing.
- Releasing a change to the client before the API it depends on is released.
