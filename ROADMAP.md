# Roadmap

These items are proposals for discussion, with no timelines or implementation commitments.

- Default client compatibility and supported protocol revisions.
- Interoperability testing with Codex, Claude, Cursor, and Inspector.
- Public API review and stabilization.
- Clean installation tests using packed npm artifacts.
- Supported runtime and dependency version policy.
- Package metadata, licensing, and npm configuration.
- Documentation and quickstarts using Docusaurus, hosted on GitHub Pages — platform selected; implementation deferred.
- Versioning, changelogs, and release verification.
- Initial npm release.
- Handler execution context and cooperative cancellation — v0 implemented (see `AGENTS.md`); progress and elicitation remain later work.
- HTTP authorization and per-request identity — JWT and Clerk implemented (see `docs/authorization.md`); per-tool scope policies remain later work.
- Lazy context providers — request-cached inferred accessors and typed overrides implemented (see `docs/context.md`); resource cleanup and lifecycle hooks remain later work.
- Resources support.
- Prompts support.
- SSE streaming and progress notifications.
- Subscriptions and change notifications.
- Performance, concurrency, and resilience testing.
- Ongoing protocol updates and compatibility maintenance.

Features deprecated in `2026-07-28` (sampling, logging, roots, and Dynamic Client
Registration) and the deprecated HTTP+SSE transport are proposed to stay out of
scope. See the [deprecated features registry](https://modelcontextprotocol.io/specification/2026-07-28/deprecated).
