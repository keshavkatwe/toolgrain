# Change records

Run `bun run changeset` for a user-facing library change and include the record
with that change when committing is authorized. During 0.x use patch for
compatible fixes and minor for features or breaking changes; explain migration
steps. Use `bun run changeset --empty` for repository-only work.

The six libraries form one fixed group. Changesets selects their shared version,
updates dependencies, and generates package-local changelogs. Examples and
repository tooling are ignored. `bun run release:status` previews the plan.

After records reach main, GitHub Actions creates or updates a Release PR.
Review its versions, changelogs, lockfile and passing CI. Merging that PR approves
automatic npm publication under latest and package-scoped GitHub tags/releases,
after full release verification. See [the release guide](../docs/releases.md).

The empty `native-release-automation.md` record marks this as repository-only
work. It is consumed with the next real release; no version bump is needed
for this migration. Historical RC0 and
stable 0.1.0 records remain consumed. Add new records for subsequent changes.
