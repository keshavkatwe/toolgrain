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
- Handler execution context and cooperative cancellation — v0 implemented (see `AGENTS.md`); progress, elicitation, and identity remain later work.
- Authentication integration and per-request identity.
- Resources support.
- Prompts support.
- SSE streaming and progress notifications.
- Subscriptions and change notifications.
- Performance, concurrency, and resilience testing.
- Ongoing protocol updates and compatibility maintenance.

Features deprecated in `2026-07-28` (sampling, logging, roots, and Dynamic Client
Registration) and the deprecated HTTP+SSE transport are proposed to stay out of
scope. See the [deprecated features registry](https://modelcontextprotocol.io/specification/2026-07-28/deprecated).
