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
- Expand client coverage for live OAuth login and client configurations/GUI flows
  beyond the dated reviews. These remain unverified.

A local application pilot passed nine automated checks against published
Toolgrain 0.1.2 packages on 2026-10-27, covering persistent task workflows,
concurrent requests, validation, restart recovery, and cooperative cancellation
over stdio and HTTP in both supported protocol eras. Real-user feedback and the
client checks above remain pending.

Cursor desktop 3.26.16 passed execution and recovery checks against published
0.1.2 packages over stdio, HTTP, and protected HTTP on 2026-10-27. Stopping a
running stdio or HTTP call did not abort server work; see the
[Cursor follow-up](docs/compatibility/clients.mdx#cursor-desktop-follow-up).

Claude Code 2.1.311's explicit v2 runtime was checked against published 0.1.2
packages on 2026-10-27. Modern and forced legacy calls worked over all three
transports, with the existing rich-text presentation limitation; timeout
cancellation differed by protocol. See the
[Claude Code follow-up](docs/compatibility/clients.mdx#claude-code-v2-follow-up).

The tested Codex direct-call timeout also does not promptly abort server work.
The tested Claude Code client hides supplemental text alongside structured content.
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
