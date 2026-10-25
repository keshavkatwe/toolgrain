# Change records

Run `bun run changeset` for a user-facing library change and commit the resulting
Markdown record with that change when authorized. Select patch for compatible
fixes, minor for features or breaking changes during 0.x, and explain migration
steps for breaking changes.

The six libraries form one fixed group. Repository tooling and examples are
ignored. Changesets owns version selection and dependency updates; it does not
generate package changelogs or create commits. Maintain the root CHANGELOG.md
as the shared editorial release notes. See [the release guide](../docs/releases.md).

Stable `0.1.0` is already versioned on the release branch. Changesets exited
prerelease mode and consumed `.changeset/pre.json` and the initial record under
`pre/`. Review those deletions with the six versions and Bun workspace metadata;
do not repeat the initial RC bootstrap or add replacement records just to make
`release:status` pass after versioning. Add records for subsequent changes.
Publication and tagging still require explicit authorization.
