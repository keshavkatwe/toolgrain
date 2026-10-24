# Versioning and releases

Adopted: 2026-10-23. The first planned stable release is **0.1.0**, preceded by
**0.1.0-rc.0** under npm's **next** tag. All six libraries are prepared at that
candidate version and configured for public access. The preparation date does
not establish npm publication. Commits, publication, and deployment require
their own authorization.

## Changesets and the shared version

The pinned Changesets CLI owns release planning, version selection, and internal
dependency updates. `.changeset/config.json` places the six libraries in one
explicit fixed group. Their manifests hold the shared version. Examples and
repository tooling stay private and are ignored. Automatic commits,
private-package tagging, and package changelogs are disabled.

During `0.x`, use patch records for compatible fixes and minor records for
features or breaking changes. From `1.0`, use patch/minor/major for
fixes/compatible features/breaking changes. Explain breaking changes and migration
steps. The [support policy](support-policy.md#upgrade-and-deprecation-rules),
including minimum increases and removal notices, still applies.

On 2026-10-24 the user selected **0.1.0-rc.0** under npm's **next** tag as the
first publication, before stable `0.1.0`, and subsequently authorized merging the
canary fix and making that prerelease. Publication still waits for review and
green supported verification of the prepared candidate on main.

Changesets prerelease mode uses `rc` for the version suffix; npm publication uses
the separate `next` dist-tag. `.changeset/pre.json` tracks the mode, and Changesets
retains the initial release record under `.changeset/pre/` for stable promotion.
The initial conversion used an unpublished `0.0.0` planning baseline and a minor
record so Changesets selected exactly `0.1.0-rc.0`. No `0.0.0` package is released;
do not repeat that bootstrap. The release tests cover RC0, RC1, stable promotion,
and packed internal dependency versions.

## Record changes and prepare a release PR

For user-facing library changes, run `bun run changeset`, select affected
libraries and a bump type, and write a summary. Include that record with the
change when committing is authorized. Use `bun run changeset --empty` for
repository-only work needing no library release. The initial candidate is already
versioned; add records only for subsequent changes.

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
publish. In the current `rc` mode, new records advance the candidate series.

Run `release:status` before versioning. Once records are consumed, the unmerged
release branch can report changed packages with no active Changesets records when
compared with main. Review consumed records, records moved to `.changeset/pre/`,
and prepared version changes;
do not add replacement records just to make that comparison pass. Normal CI
checks the prepared versions with `release:check`.

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

To prepare stable `0.1.0` after candidate testing, run `bun run changeset pre exit`
and `bun run release:version`, change all six `publishConfig.tag` values to
`latest`, and prepare the stable changelog entry. Review that release PR and run
the same full verification before a separately approved stable publication.

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

## npm publication setup

Only the six libraries in the Changesets fixed group are publishable. Their
`publishConfig` selects public access and `https://registry.npmjs.org/`;
Changesets also uses public access. The root, examples, and repository tooling
remain private. The current candidate manifests also set `publishConfig.tag`
to `next` as a defensive default. Do not run Changesets publication or tagging
commands; the explicit archive publishing process below owns npm dist-tags.

`.github/workflows/publish.yml` is manually triggered and defaults to a dry run.
It reruns Release verification for the selected commit and version, builds the
libraries, checks packed contents, and Bun-packs them in dependency order:
protocol, MCP, HTTP, Node, JWT, Clerk. npm publishes the resulting archives with
lifecycle scripts disabled. Run npm outside the checkout: the repository's Bun
`devEngines` intentionally rejects npm operating on the workspace itself.

A workflow dispatch selects `dist_tag`: RC versions require `next`, and stable
versions require `latest`. Other prerelease suffixes are rejected. The workflow
checks all six manifest tags and passes the selected tag explicitly to npm.
A real workflow publish also requires main, `dry_run: false`, and confirmation
text `publish VERSION` matching the version input. It uses the `npm` GitHub environment
and OIDC; no npm token secret is configured. The GitHub `npm` environment is
configured to permit only the `main` branch. Required reviewers are not configured;
add them where supported by the GitHub plan.
[GitHub limits required reviewers for private repositories](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#required-reviewers).
The branch restriction does not create a reviewer approval gate. Dispatching the
real publish must be an explicitly authorized maintainer action. Dry-run workflow
jobs use this same environment and therefore also require main.

### First publication

[npm requires the package to exist before trusted publishing can be configured](https://docs.npmjs.com/cli/v11/commands/npm-trust/#prerequisites).
The first release therefore uses an interactive maintainer login with access to
the `@toolgrain` scope. Publish the real, reviewed `0.1.0-rc.0` archives after release
verification and explicit approval; OIDC is for subsequent releases.

To prepare and dry-run the archives from the reviewed checkout:

```sh
set -e
bun run release:check --version 0.1.0-rc.0
bun run build --filter='./packages/*'
bun run test:size
release_packages="$(mktemp -d)"
for package in protocol mcp http node jwt clerk; do
  (
    cd "packages/$package"
    bun pm pack --ignore-scripts --filename "$release_packages/$package.tgz"
  )
done
(
  cd "$release_packages"
  for package in protocol mcp http node jwt clerk; do
    npm publish "./$package.tgz" --dry-run --ignore-scripts --access public \
      --registry=https://registry.npmjs.org/ --tag next
  done
)
```

A dry run validates publication inputs; it does not prove npm account permissions
or OIDC authentication. Keep these archives for review. After publication is
approved, authenticate from that directory with
`npm login --registry=https://registry.npmjs.org/` and run the same archive loop
without `--dry-run`, retaining `--tag next`. Stop on any failure and inspect which packages were
published before deciding how to resume; publication of six packages is not
atomic. Never rerun a published package/version or change an archive silently.
Verify each published version's integrity and dist-tags against the reviewed
archive, then exercise a fresh registry consumer using the `next` tag. Never
promote a candidate to `latest` as part of this prerelease.

### Subsequent releases with OIDC

Once packages exist, configure each package's
[npm trusted publisher](https://docs.npmjs.com/trusted-publishers/) with GitHub
owner `keshavkatwe`, repository `toolgrain`, workflow filename `publish.yml`,
environment `npm`, and permission to run `npm publish`. A new trust configuration
must complete its first successful publish within two days, so configure it
close to the next approved release. The workflow pins npm 11.21.1, which supports
OIDC. No local npm login or write token is needed for these workflow publishes.

The GitHub source repository is currently private. npm provenance is unavailable
for private source repositories; the workflow enables it automatically for real
publishes if the source repository becomes public. See
[npm provenance requirements](https://docs.npmjs.com/trusted-publishers/#automatic-provenance-generation).

The environment's main-only branch rule was configured and checked separately
from the workflow files. On 2026-10-24, read-only `npm whoami` and
`npm org ls toolgrain keshav.katwe --json` checks confirmed an authenticated
`keshav.katwe` account with the `owner` role in `toolgrain`. This role
[permits creating and publishing packages in the organization scope](https://docs.npmjs.com/organization-roles-and-permissions/).
No actual publish or publish-time authentication challenge was exercised.
Per-package OIDC trust bindings remain deferred until packages exist.
Release tags, GitHub Releases, and deployment require their own authorization.
Verify all six packages are available before announcing a release.
