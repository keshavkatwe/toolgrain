# Client interoperability — 2026-10-22

Tested Toolgrain commit `3ac65d6a29df129795f682477c55828d0351491a` on macOS arm64,
using Node 24.20.0 and Bun 1.3.14. The existing examples and additional temporary
fixtures import the compiled workspace packages. No library implementation was
changed during this review.

Discovery, schema listing, ASCII/Unicode greetings, tool variants, rich results,
request-cached context providers, public errors, private unexpected errors, and
HTTP bearer identity work in the tested Codex and Claude Code clients. Two
client behavior limitations were reproduced; neither is a malformed Toolgrain
wire response.

## Results

| Client/configuration | Stdio | HTTP | Protected HTTP | Revision |
| --- | --- | --- | --- | --- |
| Inspector 2.11.0, explicit modern | Pass | Pass | Not tested | `2026-07-28` |
| Inspector 2.11.0, explicit legacy | Pass | Pass | Not tested | `2025-06-18` |
| Inspector 2.11.0, automatic discovery | Pass | Pass | Not tested | `2026-07-28` |
| Codex CLI/app-server 0.163.0-alpha.10.2, default | Pass with timeout limitation | Pass with timeout limitation | Pass with timeout limitation | `2025-06-18` |
| Same Codex, modern flag and stdio marker | Pass with timeout limitation | Pass with timeout limitation | Pass with timeout limitation | `2026-07-28` |
| Same Codex, modern flag without stdio marker | Pass with timeout limitation | Pass with timeout limitation | Pass with timeout limitation | Legacy stdio; modern HTTP |
| Claude Code 2.1.191, default | Pass with rich-result limitation | Pass with rich-result limitation | Pass with rich-result limitation | Negotiates down to `2025-06-18` |
| Same Claude Code, explicit v2/auto negotiation probe | Same result | Same result | Same result | Still `2025-06-18` |
| Cursor Agent CLI 2026.10.19-6bbf2c4 | Discovery/listing pass | Discovery/listing pass | Discovery/listing pass | Negotiates down to `2025-06-18` |

Inspector passes all 30 existing checks. Codex passes 93 of 102 assertions; the
other nine reproduce the same timeout limitation across three configurations
and three transports. Claude Code passes 30 of 33 assertions in each of two runs;
the other three reproduce the same rich-result limitation across transports.
Both tested workarounds for that limitation pass in all three transports.
Cursor passes four discovery/authentication checks; its tool execution and
cancellation remain unverified. Four explicit cancellation/disconnect controls
and three Claude Code timeout-response checks also pass.

## Issues

### P2: Codex direct tool-call timeouts do not promptly cancel server work

Reproduction:

1. Set `tool_timeout_sec = 2` on the configured MCP server.
2. Call a tool through `mcpServer/tool/call` whose handler waits ten seconds and
   records an event when `ctx.signal` aborts.
3. The app-server call fails with `timed out awaiting tools/call after 2s`.
4. No handler abort occurs within the following three seconds.

This occurs in all nine client/transport combinations. The stdio capture
contains no `notifications/cancelled` for these requests. The HTTP connections
remain active through the observation window; a pending handler aborts when the
test client is subsequently closed. A client deadline therefore does not provide
a matching server execution deadline in this app-server path.

Positive controls through the same fixtures pass: an explicit stdio cancellation
aborts the handler and suppresses its response, and disconnecting an HTTP request
aborts its handler in both revisions. This distinguishes the observed client
behavior from a server cancellation or forwarding-fixture fault.

Claude Code's separate `MCP_TOOL_TIMEOUT=2000` probe sends
`notifications/cancelled` and aborts the stdio handler. Its legacy HTTP requests
also send cancellation notifications; those are advisory under Toolgrain's
confirmed independent-request design and return 202. The HTTP handlers abort
when that test client subsequently closes its connections. No session/client
identity was introduced to correlate an independent notification with a call.

Applications performing expensive work should apply their own execution
deadlines. These results cover the app-server direct-call API; interactive
Ctrl+C behavior was not tested. A new Toolgrain timeout API remains a separate
design decision.

### P2: Claude Code hides supplemental text when structured content is present

The server sends this valid tool result:

```json
{
  "content": [
    { "type": "text", "text": "Rich report" },
    { "type": "text", "text": "{\"count\":2}" }
  ],
  "structuredContent": { "count": 2 }
}
```

Claude Code supplies only `{"count":2}` to its model-facing `tool_result`.
The separate `Rich report` text is absent. The CLI's emitted user/tool-result
event shows the same normalization. This occurs over stdio, HTTP, and protected
HTTP, and is unchanged by the v2/auto environment probe on this installed build.

Two workarounds were verified over every transport:

- Include important narrative information in structured content, for example
  `{ "count": 2, "summary": "Rich report" }`.
- Return text content without structured content when that is the intended
  contract; both text blocks then reach the model-facing result.

The latter requires omitting the Toolgrain output schema, since successful
explicit results with an output schema must provide structured content. These
are application choices; Toolgrain should not silently discard structured output
or change an application's declared schema to compensate for client rendering.

## Method and evidence

Codex was driven through the installed app-server's experimental control API,
using temporary configuration and ephemeral threads. No inference turn started.
The three configurations match the existing compatibility report. Invalid bearer
credentials were also rejected without exposing protected tools in every case.
See the [official app-server documentation](https://learn.chatgpt.com/docs/app-server).

Claude Code was run with `--bare --print --strict-mcp-config`, explicit temporary
MCP configuration, and isolated settings. A loopback Messages API fixture emitted
deterministic tool-use responses and recorded the tool results it received. The
actual installed Claude Code process performed MCP discovery and execution; no
paid model request, subscription credentials, or system keychain access was
needed. This verifies the MCP client and its model-facing normalization, rather
than a live Anthropic account/inference path. See the
[Claude Code headless documentation](https://code.claude.com/docs/en/headless).

Cursor's installed desktop version is 0.48.6. Its UI probe stalled and returned
only an empty HTML accessibility surface, so a separate official Cursor Agent
CLI release was downloaded and unpacked into the temporary test directory.
The desktop installation was not upgraded. `CURSOR_CONFIG_DIR` and
`NODE_COMPILE_CACHE` point to disposable test folders; only the local fixture
servers were approved with `mcp enable`, then checked with `mcp list-tools`.
See Cursor's [CLI installation](https://cursor.com/docs/cli/installation) and
[MCP command documentation](https://cursor.com/docs/cli/mcp).

Cursor lists all nine fixture tools over stdio, HTTP, and protected HTTP.
It offers `2025-11-25`, accepts `2025-06-18`, and continues with POST requests
after the optional HTTP event-stream GET receives 405. Invalid bearer
credentials receive 401 and expose no protected tools. Its CLI subsequently
reports `fetch failed` while attempting OAuth discovery against the deliberately
offline authorization-server URL; a real OAuth login flow was not tested.
The public MCP CLI exposes discovery/listing commands rather than direct tool
execution, and no signed-in Cursor model session was started. This remains a
coverage gap for Cursor, not a verified execution pass.

Claude Code offered `2025-11-25` during initialization and successfully accepted
Toolgrain's `2025-06-18` response. Setting `MCP_SDK_GENERATION=v2` and
`MCP_PROTOCOL_NEGOTIATION=auto` did not produce a modern handshake in version
2.1.191. This is not evidence that Toolgrain supports `2025-11-25`. Current
[Claude Code documentation](https://code.claude.com/docs/en/mcp#mcp-client-runtimes)
describes newer builds with a v2 runtime; those builds were not tested here.

The protected fixture uses a synthetic bearer token and custom `AuthProvider`.
Its tool reads the verified identity using `createAuthAccessor`, and the context
fixture checks that concurrent provider access shares one value per request.
JWT/Clerk OAuth login, interactive GUI tool use, remote deployments, parameter
header annotations, and image/audio presentation remain outside this report.

Local JSON evidence is stored in the ignored `reports/compatibility/` directory:

- `inspector.json`: 30 CLI checks against the compiled examples.
- `codex.json`: 102 assertions, observed results, and stdio/HTTP captures.
- `claude.json` and `claude-v2-probe.json`: model-facing results and wire captures.
- `claude-timeout.json`: timeout results and cancellation notifications.
- `cursor.json`: listing output, negotiated revisions, metadata and 401 captures.
- `cancellation-controls.json`: explicit cancellation/disconnect controls.
- `summary-2026-10-22.json`: counts and status for each run.

The harness is saved under the ignored `reports/compatibility/harness/` directory.
The capture proxy uses Node's HTTP request API to preserve the external Host
authority, including during protected-resource metadata discovery. These local
artifacts are supplementary evidence; the table above records the tested scope
and the remaining gaps.
