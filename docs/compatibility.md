# Client compatibility verification

Verified on 2026-10-16 against Toolgrain commit
`a71f2004395c2a294aceb2f3bd4c04946793d4a1`, using Node 24.20.0 on macOS arm64.
Toolgrain's implementation and feature scope were unchanged during verification.
These results cover MCP `2026-07-28` tools over stdio and independent HTTP POSTs
with JSON responses.

## Results

| Client | Stdio | Plain Node HTTP | Required client configuration |
| --- | --- | --- | --- |
| MCP Inspector 2.11.0 CLI | Pass | Pass | `--protocol-era modern`; `auto` discovery also passes |
| Codex CLI/app-server 0.163.0-alpha.10.2 | Pass | Pass | `features.mcp_2026_07_28 = true`; stdio additionally needs the marker below |

Inspector runs nine checks per transport, for 18 passing checks:

| Check | Observed result on both transports |
| --- | --- |
| Modern discovery | Reports revision `2026-07-28`, expected server identity, and tools capability |
| Tool listing with `--strict` | `greet` has an object input schema requiring `name`; schema portability gate passes |
| Call with `{"name":"Ada"}` | Structured greeting and matching JSON text |
| Call with `{"name":"Zoë 世界"}` | Unicode survives request and response |
| Call with `{"name":""}` | Tool result has `isError: true`; Inspector exits 5 |
| Call with `{"name":42}` | Tool result has `isError: true`; Inspector exits 5 |
| Call an unlisted tool | Inspector reports `tool_not_found` before calling it |
| Automatic protocol detection | Selects `2026-07-28` successfully |
| Explicit legacy connection | Rejected, as expected for a modern-only server |

The unlisted-tool check verifies Inspector's client-side behavior. It does not
exercise Toolgrain's unknown-tool protocol error. The other call checks use the
server's returned results.

Codex independently passes discovery, tool listing, a structured greeting, and
an empty-name validation error over each transport. Captured MCP traffic contains
`server/discover`, `tools/list`, and `tools/call`, with
`params._meta["io.modelcontextprotocol/protocolVersion"]` set to `2026-07-28`.
HTTP POSTs also carry matching `MCP-Protocol-Version`, `Mcp-Method`, and
`Mcp-Name: greet` headers as applicable.

## What the client settings mean

Toolgrain implements one protocol revision. These settings select that revision
in the client; they do not enable a Toolgrain feature or require a server code
change.

### Inspector

Use `--protocol-era modern` or select **Modern** under Protocol Era in the
Inspector UI. Modern mode pins `2026-07-28`; `auto` probes discovery first.
Inspector defaults to legacy mode, which sends the older `initialize` handshake.
The repository's existing `inspect` scripts already select modern mode.
See the official [protocol-era documentation](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/protocol-eras).

The Inspector CLI calls its connection-only operation `--method initialize`.
In modern mode this performs discovery; it does not require Toolgrain to
implement the legacy MCP `initialize` method.

### Codex

The tested alpha build requires this feature flag for both transports, plus a
per-server stdio marker:

```toml
[features]
mcp_2026_07_28 = true

[mcp_servers.toolgrain_stdio]
command = "node"
args = ["/absolute/path/to/toolgrain/apps/stdio-example/dist/index.js"]

[mcp_servers.toolgrain_stdio.env]
CODEX_MCP_PROTOCOL_VERSION = "2026-07-28"

[mcp_servers.toolgrain_http]
url = "http://127.0.0.1:3000/mcp"
```

Codex consumes `CODEX_MCP_PROTOCOL_VERSION` to select its stdio protocol mode;
the captured child environment does not contain the marker. HTTP needs only the
feature flag. These settings were verified on the exact alpha build above and
may change as Codex's modern-protocol support develops. The build identifies the
feature as under development. No persistent user configuration was changed.

Negative controls establish that both settings matter:

| Codex configuration | Actual MCP traffic and result |
| --- | --- |
| Feature off, stdio marker present | Legacy `initialize` with `2025-06-18`; rejected with `-32602`, `Invalid request metadata` |
| Feature off, HTTP | Legacy `initialize`; HTTP 400 with `-32020` for missing or mismatched protocol/method headers |
| Feature on, stdio marker absent | Legacy `initialize` with `2025-06-18`; rejected with `-32602` |

Codex also issued background HTTP GET probes with a `2024-11-05` header.
Toolgrain returned 405; modern POST discovery and calls still succeeded. This
observation does not imply support for that older revision or for HTTP GET.

## Repeat the Inspector checks

Use Node 24.20.0 or a newer supported Node version and Bun 1.3.14. From the
repository root:

```sh
bun install --frozen-lockfile
bun run build --filter=@toolgrain/stdio-example... --filter=@toolgrain/http-example...
node scripts/verify-inspector.mjs
```

The script resolves Inspector **2.11.0** through Bunx outside the workspace,
uses the invoking Node executable for both servers, starts a test-owned HTTP
server on an available loopback port, and checks actual compiled examples. It
uses temporary Inspector configuration/storage and an in-memory secret store.
It closes test-owned processes and removes its temporary configuration after
the run. On POSIX systems it owns subprocess groups so timeout and signal
cleanup also reaches Inspector's stdio child.
No browser, model call, account authentication, or npm publication is needed.
The first run needs registry access unless Inspector is already cached.

For a preinstalled copy, bypass Bunx resolution while retaining the version check:

```sh
node scripts/verify-inspector.mjs --inspector-cli /absolute/path/to/inspector/clients/launcher/build/index.js
```

Runs write pass/fail status, completed results with stdout/stderr and exit codes,
client/runtime versions, and source revision to
`reports/compatibility/inspector.json`. Failed runs replace previous success
reports and include the failure message. This is
an explicitly invoked check; it is not added to CI and does not add an MCP SDK
dependency to Toolgrain. The [Inspector CLI documentation](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/cli)
describes its JSON output and nonzero exits for tool errors.

## Codex verification method

Tests launched the installed `codex app-server --stdio` with an isolated
temporary configuration and an ephemeral thread. The configured model provider
pointed to an unused loopback port and required no authentication. No inference
turn was started. This exercises Codex's real MCP client without a model deciding
whether or how to call a tool.

The deterministic app-server control sequence was:

1. `initialize` with `capabilities.experimentalApi: true`, then `initialized`.
2. `thread/start` with `ephemeral: true`, using the temporary test directory.
3. `mcpServerStatus/list` for each configured server, with the returned `threadId`
   and `detail: "toolsAndAuthOnly"`; assert connected status and the `greet` schema.
4. `mcpServer/tool/call` with that `threadId`, the server name, `tool: "greet"`,
   and `arguments: {"name":"Compatibility"}`; assert the structured greeting.
5. Repeat the call with `arguments: {"name":""}`; assert `isError: true`.

The app-server control protocol has its own `initialize` operation. The captured
MCP server traffic separately confirms that the client uses modern discovery.
Temporary stdio/HTTP forwarding taps recorded the wire messages and responses.
All test-owned processes were stopped afterward. A local evidence summary is
retained under `reports/compatibility/codex.json` for this verification run.

## Limits and release implication

The tested tools flow is compatible with these exact clients and settings.
Codex's desktop GUI, Claude, Cursor, other host versions, authentication, remote
deployments, and real-client cancellation were not exercised. Inspector was
tested through its CLI; its UI was not reverified here. HTTP interoperability was
checked against the plain Node example, not independently against every
framework example. The greeting tool has no parameter-header annotations, so
automatic `Mcp-Param-*` mirroring was not part of these client checks.

The tested modern-mode tools flow passes. Default client compatibility remains
an unresolved release requirement: the tested Codex build fails without the
opt-in settings above. Supporting additional protocol revisions remains a
proposed roadmap item. Publishing readiness also needs the separately discussed
packaging, clean consumer installation, licensing, and documentation work.
