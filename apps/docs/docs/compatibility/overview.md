# Compatibility and current limits

Toolgrain targets two explicit MCP revisions. Protocol support, runtime support, and interoperability evidence are different claims: a supported protocol does not establish every client's UI or cancellation behavior.

## Protocol scope

| Revision | Model | Transports |
| --- | --- | --- |
| `2026-07-28` | Per-request metadata, discovery, listing, and calls | Stdio and HTTP |
| `2025-06-18` | Legacy initialization-based stdio negotiation; independent legacy HTTP requests | Stdio and HTTP |

Other revisions are unsupported. Legacy initialization can negotiate down to the supported older revision; this does not mean Toolgrain implements the client's originally offered revision. Modern stdio requests can interleave with legacy traffic after era selection.

Modern listings include cache/server metadata and icons. Legacy results omit modern envelope metadata; listings omit icons and non-object-root output schemas. Legacy structured content is object-only; other JSON results remain text. Tool lists are a single page and nonempty cursors are rejected.

## Client evidence

Inspector 2.11.0 passes the existing checks in both revisions and automatic discovery. Tested Codex and Claude Code tool flows work with documented timeout/presentation limitations. Cursor discovery/auth checks passed; execution and cancellation remain unverified. Modern Claude Code coverage, live OAuth login, GUI flows, and remote deployment remain open in the report.

See the [2026-10-22 client report](clients.md) for exact versions, assertion counts, controls, and workarounds, and [protocol verification](protocol.md) for setup and repeatable Inspector commands. Do not silently promote an old partial result into a current complete compatibility claim.

## Application requirements

Node ^24.20.0 and Bun ≥1.4.4 &lt;2 are the supported application runtimes. Strict TypeScript 5.5.4 is the declaration floor; Zod 4 is the peer requirement. Node 26 remains preview. Hosted combinations need passing CI evidence before verification claims; see [the support policy](../project/support-policy.md).

## Features outside the current scope

Resources and prompts methods, elicitation/multi-round-trip input, progress, subscriptions/change notifications, HTTP sessions, SSE streaming, and resumability are separate future work. There is no built-in per-tool timeout API or automatic provider cleanup. Endpoint auth is implemented; token issuance and per-tool scope-policy configuration are not.
