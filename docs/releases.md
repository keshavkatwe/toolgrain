# Versioning and releases

Adopted: 2026-10-23. All six libraries are published as **0.1.0-rc.0** on
[npm/GitHub](https://github.com/keshavkatwe/toolgrain/releases/tag/v0.1.0-rc.0).
On 2026-10-25 the user accepted the documented RC limitations and authorized
preparing stable **0.1.0**, initially leaving its changes uncommitted for review.
The user subsequently authorized the stable commit and PR against main. Versions
are prepared on `codex/release-0.1.0-stable`; review/merge, final hosted
verification, publication, and tag/GitHub release remain pending.
A preparation date does not establish publication. See the current gates in
[ROADMAP.md](../ROADMAP.md#before-stable-010).

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

The first publication was selected as `0.1.0-rc.0` under `next`, before stable
`0.1.0`, and completed after explicit approval and green release verification.
The [RC0 acceptance review](rc0-acceptance-2026-10-25.md) records the published
package checks, client limitations, and the user's scope acceptance.

Changesets prerelease mode used `rc` for the version suffix and retained the
initial record under `.changeset/pre/`. The initial conversion used an
unpublished `0.0.0` planning baseline and a minor record to select RC0. No package
was published at `0.0.0`; do not repeat that bootstrap. Stable preparation ran
`bun run changeset pre exit` and `bun run release:version`, consuming the
prerelease state/records and aligning all six libraries and Bun workspace
metadata at `0.1.0`. The release tests cover RC0, RC1, stable promotion, and
packed internal dependency versions.

## Record changes and prepare a release PR

For user-facing library changes, run `bun run changeset`, select affected
libraries and a bump type, and write a summary. Include that record with the
change when committing is authorized. Use `bun run changeset --empty` for
repository-only work needing no library release. Stable `0.1.0` is already
versioned on the release branch; add records only for subsequent changes.

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
publish. Prerelease mode has been exited for this stable preparation; do not
rerun versioning just to refresh a status report.

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

The stable branch has exited prerelease mode, selected `0.1.0`, changed all six
`publishConfig.tag` values to `latest`, and prepared the stable changelog and
installation notes. Review and merge its release PR when authorized, then run
the same full verification on that exact main commit before a separately
approved stable publication.

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
remain private. Prepared stable manifests set `publishConfig.tag` to `latest`;
RC manifests use `next`. Do not run Changesets publication or tagging
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

### First publication completed

[npm requires packages to exist before trusted-publisher setup](https://docs.npmjs.com/cli/v11/commands/npm-trust/#prerequisites).
RC0 therefore used an explicitly approved interactive maintainer login,
reviewed Bun archives, and npm 11.21.1 outside the checkout. Login renewal and
publish-time browser verification were exercised. All six downloaded archives
matched the reviewed bytes and registry integrity metadata; fresh `@next`
consumers passed strict declarations and Node/Bun runtime checks.

npm assigned `latest` to the initial RC0 publication despite explicit
`--tag next` and rejected removing it with HTTP 400. Its
[registry specification](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md)
requires a `latest` tag. Both tags currently resolve to RC0; this does not mean
stable `0.1.0` is published. Stable publication explicitly uses `latest`, and
any intentional change to `next` needs separate review. Do not republish RC0 or
publish a placeholder version to work around the registry behavior.

### Prepare and dry-run reviewed stable archives

From the reviewed stable checkout:

```sh
set -e
bun run release:check --version 0.1.0
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
      --registry=https://registry.npmjs.org/ --tag latest
  done
)
```

A dry run validates publication inputs; it does not prove npm permissions or
OIDC authentication and does not authorize a real publish. Keep the archives
for review. The planned stable publication uses the workflow after its six
trusted-publisher bindings are configured and publication is explicitly
approved. Stop on any failure and inspect which packages were published before
resuming: six-package publication is not atomic. Never republish an existing
version or silently replace a reviewed archive. Verify all six registry
versions, integrity, actual tags, and fresh consumers after publication.

### Subsequent releases with OIDC

All six packages now exist. Configure each package's
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
RC0 publication and browser authentication completed on 2026-10-25.
Per-package OIDC trust bindings remain unconfigured and workflow publication is
unverified; configure them close to the approved stable publish.
RC0's tag/GitHub prerelease are published. The stable tag/GitHub release and
deployment require their own authorization.
Verify all six packages are available before announcing a release.
