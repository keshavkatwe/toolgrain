# Versioning and releases

Adopted: 2026-10-23. The first planned release is **0.1.0**. All six libraries
remain private and unpublished. Commits, publication, and deployment require
their own authorization.

## Changesets and the shared version

The pinned Changesets CLI owns release planning, version selection, and internal
dependency updates. `.changeset/config.json` places the six libraries in one
explicit fixed group. Their manifests hold the shared version. Examples and
repository tooling are ignored; private library versioning is enabled.
Automatic commits, private-package tagging, and package changelogs are disabled.

During `0.x`, use patch records for compatible fixes and minor records for
features or breaking changes. From `1.0`, use patch/minor/major for
fixes/compatible features/breaking changes. Explain breaking changes and migration
steps. The [support policy](support-policy.md#upgrade-and-deprecation-rules),
including minimum increases and removal notices, still applies. Prerelease
channels remain a separate decision.

## Record changes and prepare a release PR

For user-facing library changes, run `bun run changeset`, select affected
libraries and a bump type, and write a summary. Include that record with the
change when committing is authorized. Use `bun run changeset --empty` for
repository-only work needing no library release. The initial empty record keeps
our already-selected 0.1.0 baseline without another bump.

Maintain the root [CHANGELOG.md](../CHANGELOG.md) manually. Add user-facing notes
under Unreleased, grouped as useful under Added, Changed, Fixed, Removed, and
Security. During release review, reconcile those notes with the Changesets
records, move them into a dated `## [X.Y.Z] - YYYY-MM-DD` entry, and leave an
empty Unreleased section. The preparation date does not establish publication.
No script parses, finalizes, or validates the changelog.

On a release branch from current main:

```sh
bun run release:status
bun run release:version
bun install --frozen-lockfile
bun run release:check
```

`release:status` shows Changesets' plan and can report missing change records.
`release:version` runs Changesets, consumes records, and synchronizes the six
Bun lockfile workspace versions. It does not commit, tag, push, open a PR, or
publish. For the initial empty record, the version stays 0.1.0.

The Bun workaround is required by our pinned 1.3.14: `--lockfile-only` retains
stale workspace versions that packing uses for `workspace:*` dependencies.
The helper updates only those metadata fields, preserving external resolutions
and all other lockfile bytes. The alignment check compares all six manifest
versions and their Bun workspace metadata. An optional
`bun run release:check --version X.Y.Z` checks an expected release version too.
This is the only custom release tooling; existing package verification remains
responsible for exports, contents, installation, declarations, and runtime checks.

Review the six versions, consumed records, lockfile, shared changelog, and
migration steps. Once committing and opening a PR are authorized, create a
normal `Release vX.Y.Z` PR and merge through review and required CI.

## Verify the release

After merging the release PR, manually run **Release verification** in GitHub
Actions on main with the expected version. It checks alignment and reuses the
baseline and full support workflows, including intermediate TypeScript and
stable dependency probes. Supported checks must pass; existing Node 26 and
prerelease probes remain informational. Existing report artifacts retain the
verification evidence. This workflow does not create candidate archives or
checksums, and has no publication step.

Changelog accuracy, the chosen version, consumed change records, and readiness
to release remain part of human review. The alignment check does not establish
those decisions or untested client/platform compatibility.

## Publication boundary

npm publication settings and the eventual approved publishing process remain
separate work. Do not run Changesets publication or tagging commands during
preparation. Release tags and GitHub Releases also require authorization.
Verify all six packages are available before announcing a release.
