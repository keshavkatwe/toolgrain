# Client compatibility verification

The latest published-package check is the
[2026-10-25 verification](./rc0-acceptance-2026-10-25.md). Detailed
[2026-10-22 interoperability findings](./interoperability-2026-10-22.md) cover the
merged public API, context providers, protected HTTP, and observed client
limitations. The dated verification below retains the earlier baseline.

Verified on 2026-10-17 using Node 24.20.0 on macOS arm64. This report covers the
dual-era working tree: MCP `2025-06-18` and `2026-07-28` tools over stdio and
independent HTTP POSTs with JSON responses. Local reports record the checked-out
base Git revision; verification can include uncommitted working-tree changes.

## Results

| Client and mode | Stdio | Plain Node HTTP | Negotiated revision |
| --- | --- | --- | --- |
| Codex CLI/app-server 0.163.0-alpha.10.2, normal configuration | Pass | Pass | `2025-06-18` |
| Same Codex build, explicit modern settings | Pass | Pass | `2026-07-28` |
| Same Codex build, modern flag but no stdio marker | Pass | Pass | Legacy stdio, modern HTTP |
| MCP Inspector 2.11.0 CLI, legacy mode | Pass | Pass | `2025-06-18` |
| MCP Inspector 2.11.0 CLI, modern mode | Pass | Pass | `2026-07-28` |
| MCP Inspector 2.11.0 CLI, automatic discovery | Pass | Pass | `2026-07-28` |

Codex's normal test configuration contains neither `features.mcp_2026_07_28` nor
`CODEX_MCP_PROTOCOL_VERSION`. Captured traffic starts with `initialize` requesting
`2025-06-18`, then `notifications/initialized`, `tools/list`, and `tools/call`.
Both transports return the expected identity and tool schema, ASCII and Unicode
greetings, and `isError: true` for empty or numeric names. All six
client/transport combinations across the three configurations pass, including
24 tool calls. The same HTTP example serves both eras.

Modern captures confirm `server/discover`, per-request version/capability
metadata, and matching HTTP routing headers. Legacy wire results omit modern
`resultType` and cache fields; modern wire results retain them. CLI clients can
normalize these fields before printing, so envelope assertions use raw captures
and integration tests.

After separating the modern and legacy modules on 2026-10-17, all client checks
above pass again. A frozen build of `a235d7e` and the refactored build also produce
identical results across 147 observations covering both eras, HTTP statuses and
headers, malformed requests, stdio initialization, cancellation, and shutdown.
Public server, transport, and HTTP declarations remain byte-identical. Modern
modules have no direct or transitive dependency on legacy modules within MCP or
HTTP; execution and transport behavior stay shared.

## Unified tool API verification — 2026-10-18

After moving tool authoring and execution into `@toolgrain/mcp`, Inspector 2.11.0
passes all 30 checks again over real stdio and plain Node HTTP, covering modern,
legacy, and automatic discovery. Strict tool listings now also verify the title,
read-only annotation, and object output schema. The Codex results above describe
the earlier verification; Codex was not rerun for this API change.

The library suites and six example applications pass 182 tests. Each example
imports `tool` and `createServer` from `@toolgrain/mcp` and verifies metadata,
output-schema discovery, and execution in both revisions. Additional server tests
cover parsed/defaulted/transformed outputs, asynchronous validation, rich content,
explicit errors, cancellation during output validation, and incompatible legacy
metadata/output-schema omission. Compiled package/declaration checks pass, and
vendor integrity remains unchanged. MCP coverage is 99.52% statements, 99.32%
branches, 99.03% functions, and 100% lines.

Structured error validation was also rechecked on 2026-10-18: both revisions now
validate any supplied `structuredContent` against the declared output schema,
including `isError: true` results. Text-only errors may omit structured data;
output defaults do not create it. Regression tests cover parsed error defaults,
transforms, async refinements, and `0`, `false`, and `null` payloads. All 93 MCP and
38 HTTP tests pass, as do source type checks and compiled declaration checks for
valid text-only errors and rejected incompatible structured errors.

Review fixes on 2026-10-19 treat undefined optional `mcpResult()` envelope and
content fields, and undefined optional properties after output parsing, as absent.
Undefined values inside unparsed structured data are still rejected. Text that
serializes the original structured data is replaced by the parsed serialization.
Tools and rich results are recognized across duplicate package copies through
registered-symbol brands; spreads still lose the brand. MCP now passes 99 tests.

## Normal Codex setup

Build the examples and configure the command or URL using normal MCP settings:

```sh
bun run build
bun run --cwd apps/http-example start
```

```toml
[mcp_servers.toolgrain_stdio]
command = "node"
args = ["/absolute/path/to/toolgrain/apps/stdio-example/dist/index.js"]

[mcp_servers.toolgrain_http]
url = "http://127.0.0.1:3000/mcp"
```

Use a Node version satisfying the repository's runtime requirement. Start the
HTTP example separately; Codex launches the stdio command itself. No modern
feature flag or per-server protocol marker is required for the tested build.
Persistent user configuration was not changed during verification.

### Explicit modern verification

These optional settings select `2026-07-28` in the tested Codex alpha:

```toml
[features]
mcp_2026_07_28 = true

[mcp_servers.toolgrain_stdio.env]
CODEX_MCP_PROTOCOL_VERSION = "2026-07-28"
```

HTTP uses the feature flag; stdio also needs the marker for modern mode. Without
the marker, that Codex build still connects over legacy stdio. These settings
are specific to the tested alpha and may change.

## Repeat the Inspector checks

Use Node 24.20.0 or a newer supported Node version and Bun 1.3.14:

```sh
bun install --frozen-lockfile
bun run build --filter=@toolgrain/stdio-example... --filter=@toolgrain/http-example...
node packages/repo-tools/src/cli.mjs verify-inspector
```

The command (also `bun run verify:inspector`) pins Inspector 2.11.0 through
Bunx outside the workspace, runs the compiled examples using the invoking Node
executable, and starts HTTP on an available loopback port. Configuration, storage, and secrets are temporary.
It cleans up subprocess groups on POSIX systems, including timeouts and signals.
No browser, authentication, inference, or npm publication is needed. An uncached
Inspector needs registry access. To use a preinstalled copy:

```sh
node packages/repo-tools/src/cli.mjs verify-inspector --inspector-cli /absolute/path/to/inspector/clients/launcher/build/index.js
```

There are **30 passing checks**, 15 per transport:

- In each era: discovery/connection, strict tool-schema listing, ASCII and
  Unicode greetings, empty-string and numeric-input errors, and an unlisted tool.
- Automatic discovery selects modern mode on each transport.

Inspector rejects unlisted tools client-side. That check does not exercise the
server's unknown-tool error; package and process integration tests cover it.
Inspector exits 5 for `isError: true`. Its connection-only CLI operation is named
`--method initialize` in both eras; modern mode performs discovery. Interactive
`inspect` scripts select modern mode; this verification script tests both.
See the official [protocol-era](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/protocol-eras)
and [CLI documentation](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/cli).

Runs write status, stdout/stderr, exit codes, versions, and base revision to
`reports/compatibility/inspector.json`. Failures replace earlier success reports.
This manual check is not added to CI and adds no MCP SDK dependency.

## Codex verification method

Tests launched the installed `codex app-server --stdio` with isolated temporary
configuration and an ephemeral thread. An unused loopback model provider required
no authentication; no inference turn started. The control sequence was:

1. `initialize` with `capabilities.experimentalApi: true`, then `initialized`.
2. `thread/start` with `ephemeral: true`, using the temporary test directory.
3. `mcpServerStatus/list` for each server and returned `threadId`, using
   `detail: "toolsAndAuthOnly"`; assert connection and schema.
4. `mcpServer/tool/call` with names `Compatibility` and `Zoë 世界`; assert greetings.
5. Repeat with an empty and numeric name; assert `isError: true`.

The control protocol has its own `initialize`. Separate stdio/HTTP forwarding
taps capture actual MCP traffic to distinguish it. All test-owned processes were
stopped. A sanitized local summary is retained at `reports/compatibility/codex.json`.

## Protocol behavior and limits

- Initialization negotiates `2025-06-18`, including when a client proposes another
  revision. A client unable to use it must stop. This does not implement or claim
  the proposed revision. Modern discovery advertises the two supported revisions.
- Modern metadata and HTTP routing headers remain strict. Contradictory versions
  are rejected. Stdio keeps legacy readiness per connection while allowing
  independent modern requests; HTTP selects the revision per POST without
  session IDs or one client's negotiated version affecting another.
- Legacy HTTP initialization may omit the version header; later POSTs use
  `MCP-Protocol-Version: 2025-06-18`. Optional routing/parameter headers are checked
  when present. Valid initialized/cancelled notifications return 202 empty;
  GET and DELETE remain 405.
- Legacy HTTP cancellation is advisory and cannot cancel another invocation:
  a stateless notification has no client/session identity for safe routing.
  Disconnects and stdio cancellation suppress delivery and abort the handler's
  `ctx.signal`; handlers stop early only if they observe it.
- Legacy structured content contains objects only. Other JSON outputs retain
  their JSON text. Modern output behavior remains unchanged.

The tested Codex build connects with normal settings. Claude, Cursor, other
versions, GUI flows, authentication, remote deployments, and real-client
cancellation were not exercised. Inspector was tested through its CLI. Framework
examples have real-process checks for both eras; independent host-client tests
use plain Node HTTP. Greeting has no parameter-header annotations, so real-client
parameter mirroring remains outside this report.

The [dual-era specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/versioning.mdx#backward-compatibility-with-initialization-based-versions)
permits both behaviors. Legacy [lifecycle](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle)
and [HTTP transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
rules govern initialization-based calls. Root `bun run test:package` now also
installs each packed library in its own npm consumer to check declared dependency
resolution, runtime imports, and strict declarations. A separate full consumer
checks both protocol revisions over stdio and HTTP under Node.
This installation check uses the development dependency versions and offline
JWT/Clerk initialization with test configuration; it does not extend the real-client
compatibility claims above. Licensing and other proposed roadmap items remain
separate work.
