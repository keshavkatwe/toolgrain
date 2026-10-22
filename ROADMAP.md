# Roadmap

Status updated: 2026-10-22.

Implemented and completed statuses describe the agreed scope below. Partial
verification does not imply full client compatibility. Remaining work is for
discussion, with no timelines or implementation commitments; publication and
deployment require separate authorization. All six libraries remain private and
unpublished at `0.0.0`.

## Implemented and reviewed

| Item | Status | Scope |
| --- | --- | --- |
| Supported protocol revisions and transports | Implemented | MCP `2026-07-28` and `2025-06-18` tools over stdio and independent HTTP POSTs with JSON responses. Legacy initialization can negotiate down to `2025-06-18`. |
| Public API review | Completed for the current API | All four review findings fixed and merged in [PR #22](https://github.com/keshavkatwe/toolgrain/pull/22): tool variants, rich-result types, auth diagnostics, and readonly content/icons. Further API evolution remains subject to design review. |
| Clean installation tests using packed npm artifacts | Implemented | Root `bun run test:package` verifies all six libraries through isolated npm consumers and tests both revisions over stdio and HTTP. Broader package-manager/runtime matrices remain proposals. |
| Handler execution context and cooperative cancellation | Implemented v0 | `ToolContext`, `toolContext()`, request metadata, and cancellation signals. See [project decisions](./AGENTS.md#confirmed-handler-context-design). |
| HTTP authorization and per-request identity | Implemented | JWT and Clerk integrations, eager verification, frozen identities, and protected-resource metadata. See [authorization](./docs/authorization.md). |
| Lazy context providers | Implemented | Request-cached inferred accessors, dependency/cycle checks, and typed overrides. See [context providers](./docs/context.md). |
| Package and CI verification | Implemented | Coverage floors, compiled exports/declarations, minimum TypeScript/Zod consumers, clean installs, package contents/size budgets, and dependency auditing. This is verification infrastructure, not an npm release workflow. |

## Partial verification and release preparation

| Item | Status | Remaining work |
| --- | --- | --- |
| Default client compatibility and interoperability | Partial | Inspector checks pass. Codex and Claude Code tool flows work with documented timeout/rich-result limitations. Cursor discovery/auth checks pass; tool execution and cancellation remain unverified. Modern Claude Code coverage, live OAuth login, and GUI flows remain open. See the [2026-10-22 report](./docs/interoperability-2026-10-22.md) for exact versions and limits. |
| Public API stabilization | Ongoing | The review fixes are merged; the product and API are still being designed. Release compatibility/versioning commitments remain to be agreed. |
| Supported runtime and dependency version policy | Partial | Current repository verification uses Node 24.20.0 and Bun 1.3.14. The authoring API supports strict TypeScript from 5.5.4 and Zod `^4.0.0`. Broader runtime coverage and version-maintenance policy remain to be agreed. |
| Package metadata, licensing, and npm configuration | Pending release preparation | Review release metadata, licensing decisions, and npm configuration. Packages remain private and unpublished; vendored protocol provenance/licenses are already retained. |
| Documentation and quickstarts website | Deferred implementation | Docusaurus and GitHub Pages are selected. README, guides, and framework examples exist; the public documentation site and its deployment remain separate work. |
| Versioning, changelogs, and release workflow | Pending design | Agree on versioning/changelog policy and the release process. Existing package verification is available for release checks. |
| Initial npm release | Not started | Requires release preparation and explicit publication authorization. |
| Protocol updates and compatibility maintenance | Ongoing | Pinned schemas, provenance, checksums, and integrity checks are in place. Future upstream schema/revision updates require explicit review and renewed interoperability verification. |

## Proposed future work

| Item | Status | Boundary |
| --- | --- | --- |
| Per-tool authorization/scope policies | Proposed | Separate from the implemented endpoint authorization and identity accessors. |
| Context resource cleanup and lifecycle hooks | Proposed | Provider values and application-owned resources currently have no automatic disposal. |
| Resources support | Proposed | Separate MCP feature design and implementation. |
| Prompts support | Proposed | Separate MCP feature design and implementation. |
| Elicitation and multi-round-trip input | Proposed | Additive handler-context and result design remains deferred. |
| Sessions, SSE streaming, progress, and resumability | Proposed | Current HTTP scope remains independent POST requests with JSON responses. |
| Subscriptions and change notifications | Proposed | Separate from the current static tool registry/listing flow. |
| Performance, concurrency, and resilience program | Proposed | Existing regression tests cover scoped concurrency/cancellation behavior; dedicated load, endurance, and performance testing remains future work. |

## Proposed exclusions

Features deprecated in `2026-07-28` (sampling, logging, roots, and Dynamic Client
Registration) and the deprecated HTTP+SSE transport are proposed to stay out of
scope. See the [deprecated features registry](https://modelcontextprotocol.io/specification/2026-07-28/deprecated).
