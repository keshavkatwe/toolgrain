# Changelog

Historical notes for the initial Toolgrain releases. Subsequent releases use
Changesets-generated `packages/*/CHANGELOG.md` files and package-scoped GitHub
releases; see [the release guide](docs/releases.md). All six libraries continue
to share a version.

## [Unreleased]

## [0.1.0] - 2026-10-25

First stable release, published on npm and GitHub after RC0 acceptance and
final hosted verification of commit `526ea39`.

### Changed

- Promote all six libraries from `0.1.0-rc.0` to `0.1.0`, with `latest` as the
  explicit publication tag. Changesets exits prerelease mode and consumes the
  initial prerelease record; Bun workspace metadata follows the stable versions.
- Library behavior and dependency requirements match RC0. The documented-flow
  acceptance review found no new Toolgrain blocker: 160/172 checks passed and
  12 reproduced the two existing client limitations. The user accepted those
  documented limitations for stable preparation on 2026-10-25. See the
  [RC0 acceptance review](docs/rc0-acceptance-2026-10-25.md).

### Requirements and migration

- Install the matching `0.1.0` versions of `@toolgrain/protocol`, `@toolgrain/mcp`,
  `@toolgrain/http`, `@toolgrain/node`, `@toolgrain/jwt`, and `@toolgrain/clerk`
  where used. RC0 applications can update their Toolgrain dependency versions;
  the tool authoring API and supported protocol revisions are unchanged.
- Requirements remain Node.js `^24.20.0` or Bun `>=1.4.4 <2`, ESM, strict
  TypeScript 5.5.4 or later, and Zod `^4.6.6` for MCP authoring/integrations.
- Cancellation remains cooperative; the tested Codex direct-call deadline does
  not promptly abort server work. The tested Claude Code client hides
  supplemental text when structured content is supplied; both documented
  workarounds pass. Unverified client flows remain unverified.
- HTTP scope remains independent POST requests and JSON responses. Resources,
  prompts, elicitation, persistent sessions, SSE streaming, progress,
  resumability, and subscriptions remain outside this release's scope.
- npm currently points both `next` and `latest` at RC0 because of its initial
  publication behavior. Stable publication will explicitly select `latest`;
  changing `next` is a separate decision. The RC0 GitHub prerelease remains the
  record of the published candidate.

## [0.1.0-rc.0] - 2026-10-24

First release candidate for stable `0.1.0`, prepared for verification and
publication under npm's `next` tag. This entry does not establish publication.

### Added

- Initial `@toolgrain/mcp` authoring API with reusable typed tools, Zod 4 Classic
  and Mini schemas, parsed inputs and outputs, and explicit rich results.
- MCP `2026-07-28` and `2025-06-18` support through `@toolgrain/protocol`, Node
  stdio, and independent HTTP requests using `@toolgrain/node` and
  `@toolgrain/http`.
- Cooperative cancellation, frozen request context, and lazy request-cached
  context providers with inferred accessors and typed overrides.
- HTTP authorization through `@toolgrain/jwt` and `@toolgrain/clerk`, including
  protected-resource metadata and verified request identities.
- Framework examples, packed-consumer verification, and a supported runtime and
  dependency matrix. See the [support policy](docs/support-policy.md).
- Package metadata, MIT licensing for Toolgrain-owned code, and preserved
  upstream protocol and dependency notices. Public npm settings and a manual
  publishing workflow are prepared; the first publication uses an approved
  interactive maintainer login. See the [release guide](docs/releases.md).

### Requirements and migration

- The six libraries start at the shared candidate version `0.1.0-rc.0`: `@toolgrain/protocol`,
  `@toolgrain/mcp`, `@toolgrain/http`, `@toolgrain/node`, `@toolgrain/jwt`, and
  `@toolgrain/clerk`. This is the initial release; there is no migration from an
  earlier published Toolgrain version. Stable `0.1.0` follows candidate testing;
  install candidates explicitly with the `next` tag.
- Consumer runtimes are Node.js `^24.20.0` or Bun `>=1.4.4 <2`. Repository
  development retains its separate Bun 1.3.14 pin.
- TypeScript consumers require strict mode and TypeScript 5.5.4 or later. The
  Zod peer range is `^4.6.6`, accepting Classic and Mini authoring schemas.
- Packages expose compiled ESM JavaScript and declarations. CommonJS and legacy
  `node10` module resolution are unsupported.

### Security

- Require Zod `^4.6.6` and test against minimum 4.6.6 to exclude the versions
  affected by [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
  This approved change establishes the initial release's minimum; it does not
  change the selected `0.1.0` version or TypeScript 5.5.4 minimum.
- Refresh locked example/test dependencies to `body-parser` 2.4.0 and `fast-uri`
  3.1.9 for their upstream security fixes. Other direct dependency pins are
  unchanged.

### Fixed

- Explicitly type the server's HTTP invocation options so the TypeScript 7.1
  nightly compiler can build MCP without implicit-any errors. Emitted
  JavaScript and public declarations are unchanged.

### Known limitations

- HTTP serves independent POST requests with JSON responses. Persistent
  sessions, SSE streaming, progress, resumability, and subscriptions are outside
  this release's implemented scope. MCP resources, prompts, and elicitation are
  also unimplemented.
- Cancellation is cooperative: work that ignores the handler's signal can
  continue after its response is discarded. The tested Codex direct-call
  timeout path did not promptly cancel server work; applications doing
  expensive work should enforce their own execution deadlines.
- The tested Claude Code client hides supplemental text when structured content
  is present. Put essential narrative information in structured content, or use
  text-only results without an output schema when that matches the tool's
  contract.
- Client interoperability remains partially verified. Cursor tool execution
  and cancellation, modern Claude Code coverage, live OAuth login, and GUI
  flows remain unverified. See the
  [interoperability report](docs/interoperability-2026-10-22.md) for exact tested
  versions and the scope of these findings. Final supported hosted CI results
  are required before publication; local checks do not verify other platforms.
