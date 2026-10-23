# Change records

Run `bun run changeset` for a user-facing library change and commit the resulting
Markdown record with that change when authorized. Select patch for compatible
fixes, minor for features or breaking changes during 0.x, and explain migration
steps for breaking changes.

The six libraries form one fixed group. Repository tooling and examples are
ignored. Changesets owns version selection and dependency updates; it does not
generate package changelogs or create commits. Maintain the root CHANGELOG.md
as the shared editorial release notes. See [the release guide](../docs/releases.md).

The initial 0.1.0 baseline is already selected, so it needs no bump record. Add
records for subsequent releases. Never run publication or tagging without explicit
authorization.
