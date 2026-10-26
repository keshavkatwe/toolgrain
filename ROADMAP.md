# Roadmap

Toolgrain's six libraries share a stable version under npm `latest`.
The initial [0.1.0 release](https://github.com/keshavkatwe/toolgrain/releases/tag/v0.1.0)
and [RC0 prerelease](https://github.com/keshavkatwe/toolgrain/releases/tag/v0.1.0-rc.0)
remain available; `next` retains `0.1.0-rc.0`.

## Available today

- Reusable, typed tools with Zod 4 Classic/Mini inputs, optional output schemas,
  ordinary JSON results, and explicit rich MCP results.
- MCP `2026-07-28` and initialization-based `2025-06-18` over stdio and
  independent HTTP POSTs with JSON responses.
- Node hosting and framework examples for Express, Hono, Elysia, and Next.js.
- Handler context and cooperative cancellation; JWT/Clerk endpoint authorization;
  lazy, request-cached dependencies with inferred accessors and typed overrides.
- Packed-package and strict declaration consumers, runtime/platform verification,
  coverage/content/size checks, dependency audits, and Changesets release automation.
- Hosted [documentation](https://toolgrain.mintlify.site/) with guides, API
  reference, examples, and project information.

The first complete automated release cycle passed for **0.1.1** on 2026-10-26,
including publication and fresh npm/Node and Bun consumers. See the
[release verification record](docs/releases.md#verified-automated-release).

See the [API guide](README.md), [support policy](docs/support-policy.md), and
[release guide](docs/releases.md) for the supported contracts.

## Current follow-up work

These items describe remaining review or verification, without a release date:

- Collect feedback from published stable releases in real applications and
  prioritize reproduced defects. A target application and next release scope are
  not selected.
- Expand client coverage for Cursor execution/cancellation, modern Claude Code,
  live OAuth login, and GUI flows. These remain unverified.

The tested Codex direct-call timeout does not promptly abort server work. The
tested Claude Code client hides supplemental text alongside structured content.
Controls and workarounds are recorded in the
[interoperability report](docs/interoperability-2026-10-22.md) and
[published-package verification](docs/rc0-acceptance-2026-10-25.md).

## Under consideration

These are proposals requiring separate design and scope agreement, with no
implementation commitment or timeline:

- Per-tool authorization and scope policies.
- Context cleanup and resource lifecycle support.
- MCP resources, prompts, and elicitation/multi-round-trip input.
- Sessions, SSE streaming, progress, resumability, and subscriptions.
- Performance, load, endurance, and resilience testing beyond existing regressions.

Protocol maintenance and public API stabilization continue within the
[support and upgrade policy](docs/support-policy.md). Compatibility claims remain
limited to documented, verified flows. Deprecated MCP features remain outside
the proposed scope.
