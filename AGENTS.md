# Toolgrain: contributor and agent instructions

## Working agreement

- Create a branch before editing; continue related work on its existing PR branch.
  Never edit directly on `main`.
- Create local commits only when the user explicitly requests them. An approval
  covers that commit, not later work. Never auto-merge.
- Work one agreed step at a time. Roadmap proposals do not authorize implementation,
  publication, deployment, repository migration, or visibility changes.
- Use ordinary project files for context and instructions; do not use gstack.
- Work in this repository. Do not modify or copy implementation from another
  repository without an explicit request.
- Keep confirmed behavior separate from proposals. Update the relevant public
  documentation when an agreed contract changes.
- Keep credentials, local machine paths, and private coordination records out of
  tracked files. Builds, tests, and releases must work without a private checkout.

## Product and package boundaries

Toolgrain is a TypeScript toolkit for MCP servers. Reusable, typed tool definitions
and straightforward server composition are the product focus. Implement MCP
against the pinned protocol directly, without `@modelcontextprotocol/sdk`.

| Package | Responsibility |
| --- | --- |
| `@toolgrain/mcp` | Complete tool authoring API, validation, execution, context, auth contracts, and protocol dispatch |
| `@toolgrain/protocol` | Pinned upstream wire types, protocol constants, licenses, and provenance; no runtime dependencies |
| `@toolgrain/node` | Stdio, Node HTTP handlers, and the managed HTTP listener |
| `@toolgrain/http` | Shared HTTP behavior and Web `Request`/`Response` handlers |
| `@toolgrain/jwt` | JWT authorization and its synchronous `useAuth(ctx)` accessor |
| `@toolgrain/clerk` | Clerk OAuth authorization and its synchronous `useAuth(ctx)` accessor |
| `@toolgrain/repo-tools` | Unpublished repository verification, reporting, and release tooling |

There is no separate core package. Tool definitions and execution live in
`packages/mcp/src/tools/`; the registry is internal and non-generic. Wire types
are imported from protocol, not re-exported through MCP. Keep modern and legacy
modules separate; modern modules must not depend on legacy modules. Share tool
execution and transport lifecycle through explicit internal contracts.

## Contracts to preserve

- Support only MCP `2026-07-28` and initialization-based `2025-06-18`, over stdio
  and independent HTTP POSTs with JSON responses. Legacy initialization can
  negotiate down to the supported legacy revision. Keep sessions, SSE, progress,
  resources, prompts, elicitation, and subscriptions outside the current scope.
- Registration keys define exposed tool names. Register frozen definitions made
  with `tool()`. Preserve schema inference, typed variants, readonly authoring
  inputs, and interoperability across compatible duplicate package copies.
- Use Zod 4 Core for user Classic/Mini schemas and Classic for internal validators.
  Asynchronously parse inputs and declared outputs, including defaults/transforms.
  Direct definition `execute()` calls remain raw and bypass server validation.
- Ordinary strings/JSON become MCP results. `mcpResult()` explicitly marks rich
  results; ordinary result-shaped objects remain application data. Successful
  rich results with an output schema require structured content; explicit text-only
  errors may omit it. Retain revision-specific result conversion and validation.
- Keep expected input feedback and explicit tool errors public. Unexpected parsing,
  handler/provider, and output failures return generic `Tool execution failed`
  without structured content. Diagnostics receive the original failure; tool
  details contain only frozen `toolName` and `request`, without added arguments or
  auth credentials. Auth/transport diagnostics retain their one-argument form.
  Diagnostic throws/rejections cannot disrupt responses or cleanup.
- Handlers receive non-generic `ToolContext` as `ctx`. Construct direct-call
  contexts with `toolContext()`. Request/client metadata is copied and deeply
  frozen; client claims are self-reported and unverified. Cancellation is
  cooperative: abort `ctx.signal`, suppress late results/failures, and skip a
  handler if cancellation occurs during validation. Preserve documented reasons.
- Authenticate eagerly before body parsing and tool work. Preserve copied, frozen
  identities, server-bound single-use authorization scopes, and synchronous
  integration auth accessors. Validate hosts before owned-route auth/body work;
  Node ignores forwarded headers. Applications own TLS, CORS, proxy normalization,
  and framework listeners. Auth-configured servers require request transports.
- Lazy context providers resolve only on access, cache values/failures per context,
  and support typed overrides and dependency-cycle checks. Keep provider values
  unchanged and resource ownership with the application; no automatic disposal.
- Transport instances attach once across compatible package copies. Closing is
  terminal, idempotent, and re-entrant. Stdio preserves framing/backpressure and
  supplied-stream ownership; application diagnostics never go to MCP stdout.

Use the [API guide](docs/tools.md), [authorization guide](docs/authorization.md),
[context guide](docs/context.md), and [compatibility notes](docs/compatibility.md)
for detailed behavior. Preserve documented limitations and unverified flows.

Start with [CONTRIBUTING](.github/CONTRIBUTING.md) and the
[development guide](docs/development.md) for setup, checks, and pull requests.

## Development and verification

Repository tooling uses Bun **1.3.14**. Supported application runtimes are Node
**`^24.20.0`** and Bun **`>=1.4.4 <2`**. TypeScript requires **5.5.4** or later
with strict mode; the Zod peer floor is **4.6.6**. Node 26 remains preview.
See [support-policy.json](support-policy.json) and the
[support policy](docs/support-policy.md) for compatibility and upgrade gates.

```sh
bun install --frozen-lockfile
bun run check
bun run check-types
bun run test:coverage test:examples --continue=dependencies-successful
bun run test:package
bun run test:size
bun run test:audit
bun run test:ci
```

Run checks appropriate to the change. Root commands own workspace orchestration;
keep per-package verification behind `bun run test:package`. It includes packed
consumer imports, strict declarations, minimum/current TypeScript/Zod, and runtime
flows. Preserve all existing release gates and the 95% coverage floors for MCP,
Node, HTTP, JWT, and Clerk. Protocol uses integrity/conformance checks. Report
outputs stay ignored under `reports/`.

- Public exports resolve to compiled ESM/declarations in `dist`. MCP also packages
  JavaScript/declaration maps and its TypeScript sources; preserve other packages'
  output policies. Builds clean stale output; size checks enforce archive contents.
- Dependencies are pinned with a reviewed lockfile. Audits check the complete
  lockfile outside Turbo caching; high/critical advisories and scan errors fail.
- Root `bun run dev` runs all watch/application tasks with concurrency 16.
  Framework examples remain independent; Inspector launchers are separate scripts.
- Before changing Turborepo configuration or commands, resolve the installed
  `turbo` package and read its bundled `docs/README.md` and relevant documentation.
- Keep tests and fixtures with the implementation they verify. Preserve the
  Node-specific source-map stack assertion and the supported consumer matrix.

## Releases and legal material

All six libraries share stable `0.1.0` under npm `latest`; `next` retains
`0.1.0-rc.0`. See the [release guide](docs/releases.md) and
[roadmap](ROADMAP.md) for current process and remaining verification.

- Use `bun run changeset` for library changes and `bun run changeset --empty` for
  repository-only work. `release:status` previews the plan. Compatible fixes use
  patch records; features/breaking changes use minor records during `0.x`.
- Changesets may create bot version commits and Release PRs under the approved
  automation policy. Merging a reviewed Release PR approves automated publication,
  tags, and package-scoped GitHub releases after green verification on the exact
  merged commit. Local commits still require an explicit user request.
- Keep `publish.yml`, the `npm` environment, and trusted-publisher configuration
  unchanged without explicit agreement. Preserve full supported release verification
  and post-publication integrity/fresh-consumer checks. Never republish a version,
  restore consumed bootstrap records, or invent a release to exercise automation.
- Toolgrain-owned code/artwork is MIT, copyright Keshav Katwe. Preserve upstream
  protocol licenses/provenance and all package notices unchanged. Renew the Clerk
  `standardwebhooks` notice review when changing that dependency release.
- Reuse approved artwork/tokens from `brand/`. Preserve Manrope's OFL/FONTLOG and
  reproducible sources. Website review, platform changes, and deployment are
  separate decisions; public docs builds must retain their required shared assets.
