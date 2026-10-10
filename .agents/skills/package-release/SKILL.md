---
name: package-release
description: "Use this skill when preparing a release of @taldres/laravel-waitlist: the version bump, CHANGELOG.md, generated release notes, the publish workflow with npm trusted publishing, tags and release validation. Never publish autonomously."
license: MIT
metadata:
    author: taldres
---

# Package Release

## Primary Goal

Prepare a release the maintainer only has to publish: a version that matches what changed, a passing `pnpm check`, and notes that tell consumers what to do.

## Workflow

1. Read the commits since the last tag and pick the bump by SemVer; before 1.0 a breaking change is a minor.
2. Bump with `pnpm version <patch|minor|major> --no-git-tag-version` and commit `chore: release v<version>` on a branch; open a pull request.
3. Check the Unreleased section of `CHANGELOG.md` against the changes; `update-changelog` moves the release notes in after publishing.
4. Run `pnpm check` and `pnpm pack --dry-run` to see exactly what will be published.
5. Stop there. The maintainer merges, drafts the GitHub release `v<version>` and publishes it; `release-tarball.yml` attaches the packed tarball, and `publish.yml` checks the tag against `package.json` and publishes to npm. A pre-release only gets the tarball: `publish.yml` and `update-changelog.yml` run on `released`, which pre-releases do not trigger.

## References

- `.github/workflows/publish.yml`, `.github/workflows/release-tarball.yml`, `.github/workflows/update-changelog.yml`, `.github/release.yml`

## Anti-Patterns

- Running `pnpm publish`, creating tags or GitHub releases without the maintainer asking.
- Adding an npm token to the repository instead of trusted publishing.
- Releasing a change to the client before the API it depends on is released.
