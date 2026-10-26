# Contributing to Toolgrain

Toolgrain welcomes bug reports, documentation improvements, and focused changes.
Our goal is a simple, typed API for building MCP servers. Read the
[Code of Conduct](./CODE_OF_CONDUCT.md) when participating.

## Find a starting point

- For usage, start with the [documentation](https://toolgrain.mintlify.site/) and [examples](https://toolgrain.mintlify.site/examples).
- Search [existing issues](https://github.com/keshavkatwe/toolgrain/issues) before opening a new one.
- Report a bug with a small reproducible example, package/runtime versions, and expected versus actual behavior.
- For a feature or API change, explain the problem and intended use case in an issue before investing in a large implementation.
- Report vulnerabilities privately using [SECURITY](./SECURITY.md).

The [roadmap](../ROADMAP.md) distinguishes existing capabilities from proposals.
A roadmap entry does not mean a design is settled or an implementation is underway.

## Make a change

Use Node.js 24.20.0 or a newer supported 24.x release and Bun **1.3.14** for
repository tooling. Bun application support starts at **1.4.4**, separately from
the tooling pin. See the [support policy](https://toolgrain.mintlify.site/project/support-policy).

```sh
git clone https://github.com/keshavkatwe/toolgrain.git
cd toolgrain
bun install --frozen-lockfile
git switch -c your-change
bun run build
```

For an external contribution, fork the repository and clone your fork. Create a
branch before editing. Keep the change focused and include documentation and
tests where behavior changes. Preserve upstream licenses, notices, and protocol
provenance. See [AGENTS](../AGENTS.md) for the package boundaries and contracts.

## Verify your work

Start with:

```sh
bun run check
bun run check-types
```

Run the tests covering the changed behavior. Library changes also need coverage
and compiled-package checks; packaged README changes need `bun run test:size`.
The [development guide](https://toolgrain.mintlify.site/project/development) explains the full check suite,
watch workflow, and CI. Generated reports stay under ignored `reports/` and
`coverage/` directories.

## Record release intent

Add a Changeset for a published-library change, including a packaged README:

```sh
bun run changeset
bun run release:status
```

During `0.x`, compatible fixes use patch records; features and breaking changes
use minor records. Repository-only changes use `bun run changeset --empty`.
Describe the user-visible change in the record. Do not manually bump versions
or edit generated package changelogs. See the [release guide](https://toolgrain.mintlify.site/project/releases).

## Open a pull request

Explain the problem, the resulting behavior, and how you verified it. Link a
related issue where applicable. Keep unrelated formatting, generated reports,
and local configuration out of the diff. CI must pass before merging; releases
use a separately reviewed Changesets Release PR.

Contributions to Toolgrain-owned code are made under the repository's
[MIT license](../LICENSE). Existing third-party material keeps its upstream terms.
