# Toolgrain

A TypeScript toolkit for building MCP servers, implemented independently of
`@modelcontextprotocol/sdk`.

`@toolgrain/mcp` provides the complete authoring API: reusable tool definitions,
Zod 4 validation, output schemas, rich results, and server composition. It supports
MCP `2026-07-28` and `2025-06-18` over stdio and independent HTTP POSTs with the
same tool definitions. All packages are private and unpublished.

See [project decisions](./AGENTS.md) and
[client compatibility verification](./docs/compatibility.md), and
[JWT/Clerk authorization](./docs/authorization.md), and
[lazy context providers](./docs/context.md).

## Authoring API

```ts
import { createServer, tool } from "@toolgrain/mcp";
import { stdio } from "@toolgrain/node";
import { z } from "zod";

const greet = tool({
  title: "Greeting",
  description: "Greet someone by name",
  annotations: { readOnlyHint: true, openWorldHint: false },
  input: z.object({ name: z.string().min(1) }),
  output: z.object({ message: z.string() }),
  execute: ({ name }) => ({ message: `Hello, ${name}!` }),
});

const server = createServer({
  name: "hello-server",
  version: "1.0.0",
  tools: { greet },
});

await server.listen(stdio());
```

Input and output schemas can use Zod 4 Classic or Zod Mini, including mixed
definitions. Handler inputs still infer the parsed type, and declared outputs
check the handler's return type before output parsing. For example, Mini users
can define the same tool with its functional schema API:

```ts
import * as mini from "zod/v4/mini";

const greet = tool({
  input: mini.object({ name: mini.string().check(mini.minLength(1)) }),
  output: mini.object({ message: mini.string() }),
  execute: ({ name }) => ({ message: `Hello, ${name}!` }),
});
```

Toolgrain consumes user schemas through `zod/v4/core`. Its internal wire and
metadata validators continue using Classic.

The MCP authoring API supports TypeScript 5.5.4 or later with `strict` enabled.
Supported Zod versions follow the `^4.0.0` peer range.

MCP packages JavaScript source maps, declaration maps, and their original
TypeScript sources for debugging and editor navigation. Public imports still
resolve to compiled files in `dist`. For mapped Node stack traces, start your
application with `node --enable-source-maps app.js`.

Registration keys supply exposed names: 1–128 ASCII letters, digits, underscores,
hyphens, or dots. Names are case-sensitive. Definitions are reusable across
servers, and registrations must be created with `tool()`; raw objects and modified
object spreads are rejected. Pass modified definitions through `tool()` again to
check their schema/handler types. Definitions and `mcpResult()` values from a
duplicate installed copy of a compatible `@toolgrain/mcp` version are recognized.

`tool()` accepts `title`, `description`, `annotations`, `icons`, and `_meta`
directly. Tool annotations are descriptive hints, not access controls. Metadata
must be JSON-compatible and is validated and copied when the server is created.

Handlers receive asynchronously parsed input, including defaults and transforms.
An optional `output` schema constrains the handler return type and asynchronously
parses successful returned data before serialization, applying output defaults,
transforms, and refinements. Input JSON Schema describes the accepted input;
output JSON Schema describes the parsed output. Unrepresentable schemas fail at
server construction with `ToolSchemaError`. An output-side `.transform()` is not
representable by itself; pipe it into a schema describing the parsed value, such
as `z.string().transform(Number).pipe(z.number())`. Optional output properties
that parse to `undefined` are omitted. Without `output`, handlers must return a
string, JSON value, or `mcpResult()` whose structured content is JSON-compatible.
Toolgrain checks the value at runtime but does not parse or transform it before
result conversion; `undefined` inside that data is rejected rather than dropped.

`execute` on a definition is the **raw handler**. Calling it directly bypasses
input validation, output validation, and MCP result conversion. Invoke tools
through the server's transport or `server.handle()` for the complete behavior.
The registry is an internal module; there is no separate core package.

### Handler context

Handlers receive a second argument, `ctx` (type `ToolContext`). Handlers that
only take `input` remain valid.

```ts
const search = tool({
  input: z.object({ query: z.string() }),
  async execute({ query }, ctx) {
    const response = await fetch(
      `https://example.com/search?q=${encodeURIComponent(query)}`,
      {
        signal: ctx.signal,
      },
    );
    return response.json();
  },
});
```

- `ctx.signal` is an `AbortSignal`. It aborts when a stdio client sends
  `notifications/cancelled`, when an HTTP caller's signal aborts (for example on
  disconnect), when the transport closes (including stdin EOF), or when the
  server closes. Its reason is an `AbortError`: "Request cancelled by client",
  "Connection closed" for stdio requests, or "Server closed" for `handle()`
  calls. When an HTTP caller's signal aborts, its own reason is used.
  A response is never sent after the signal aborts, so whatever the handler
  returns or throws afterwards is discarded.
- `ctx.request` holds `id`, `protocolVersion`, an optional `client` with the
  `info` and `capabilities` the client reported, and `meta`, a copy of the
  request's `_meta`. Each request gets its own deeply frozen copies. Client info
  and capabilities are recursively readonly in the handler types, including
  nested arrays. Their types cover both supported protocol eras; fields that
  differ between eras need guards, and checking `protocolVersion` alone does
  not narrow them. Legacy details retain their reported values without
  normalization. Modern requests carry client details on each request; legacy
  stdio uses those from `initialize`; legacy HTTP has none, so `client` is
  absent. Client details are self-reported and unverified, so don't base security
  decisions on them.
- If the request is cancelled while its input is still being validated, the
  handler is not started.
- Cancellation is cooperative. A handler that ignores `ctx.signal` keeps running
  until it finishes; its response is still discarded, and on stdio its request
  ID stays in use until then.

Calling `execute` directly requires a context. Build one with `toolContext()`,
optionally passing a `signal` or `request` fields. `toolContext()` is the
supported way to create a context: future versions may add required fields that
it fills in, so contexts written out by hand can stop compiling.

```ts
import { toolContext } from "@toolgrain/mcp";

await search.execute({ query: "mcp" }, toolContext());
```

### Lazy context providers

Use inferred accessors for application dependencies while keeping tools standalone:

```ts
import { createContext } from "@toolgrain/mcp";

const database = createContext({
  name: "database",
  resolve: () => sharedDatabase, // Your application-owned client or pool.
});
const useDatabase = database.use;

const services = createContext({
  name: "services",
  async resolve(ctx) {
    const db = await useDatabase(ctx);
    return { findUser: (id: string) => db.findUser(id, ctx.signal) };
  },
});
const useServices = services.use;
```

Register `context: [services, database]` on `createServer()`, in any order.
Handlers call `await useServices(ctx)`. Only accessed factories run; each tool
call caches its provider promises and values. Use
`database.provide(() => testDatabase)` for a typed server/test override, and
`toolContext({ context: [...] })` for direct calls. Context values retain their
original identity and applications own resource cleanup. See the
[context guide](./docs/context.md) for a full example, cancellation, and errors.

### Rich results

Return ordinary strings or JSON values for automatic conversion. Use
`mcpResult()` for explicit MCP content, structured data, result metadata, or
`isError`:

```ts
import { mcpResult, tool } from "@toolgrain/mcp";
import { z } from "zod";

const report = tool({
  input: z.object({}),
  output: z.object({ uri: z.string() }),
  execute: () => mcpResult({
    content: [{
      type: "resource_link",
      uri: "https://example.com/report",
      name: "Report",
    }],
    structuredContent: { uri: "https://example.com/report" },
  }),
});
```

The helper supports text, image, audio, resource links, and embedded text/blob
resources. Content and data are validated and copied during conversion. Optional
result and content fields set to `undefined` are treated as absent. A JSON text
block accompanies structured data unless an identical text block is already
present. When an output schema changes the data, a text block containing the
original JSON is updated to the parsed JSON instead of being duplicated. Ordinary objects containing `content` or `isError` remain application
data; Toolgrain does not guess that they are protocol results.

When `output` is declared, an explicit successful result must supply
`structuredContent`. Any supplied structured data is parsed against the schema,
including data in error results (`isError: true`). Errors may omit structured data
and report text in `content`; output defaults do not create structured data for
these errors. Without an output schema, structured data may be any valid JSON.
Invalid outputs become tool errors without structured data. Modern results can
contain any JSON value as structured content. Legacy structured content and
advertised output schemas are limited to objects.
Other values remain available as JSON text in legacy results. Legacy listings
retain titles, annotations, and `_meta`, and omit icons.

### Errors and diagnostics

Return `mcpResult({ isError: true, content: [...] })` for an error intended for
the client. Valid explicit errors preserve their content, structured data, and
metadata under the existing output-validation rules. Input validation failures
also return public feedback identifying the rejected fields.

Unexpected exceptions from input parsing, handlers, or context providers, along
with invalid outputs, return `isError: true` with the generic text
`Tool execution failed`, without structured data. Exception messages, stacks,
and causes remain private. These failures reach the server's optional
`onError(error, details)` callback once, with the original thrown value:

```ts
const server = createServer({
  name: "projects",
  version: "1.0.0",
  tools: { listProjects },
  onError(error, details) {
    console.error("Unexpected server failure", error, details);
  },
});
```

For unexpected tool failures, `details` is a frozen `ToolErrorDetails` containing
the exposed `toolName` and the context's frozen `request`: ID, protocol revision,
optional client information, and request metadata. Toolgrain adds no arguments,
verified identity, or bearer token to these details. Request metadata and client
information retain the client-supplied values; keep diagnostics private.
Transport and other internal request failures omit `details`. Existing callbacks
taking only `error` remain supported. Callback throws and asynchronous rejections
cannot replace the response or interrupt cleanup; diagnostics are not awaited.

Explicit tool errors, ordinary input validation failures, and protocol errors do
not reach `onError`. Failures after cancellation remain discarded without
diagnostics. Direct definition `execute()` and provider accessor calls keep their
raw return and rejection behavior; this boundary applies to server execution.

## Internal protocol package

`@toolgrain/protocol` is a private workspace package containing the pinned official
schemas and constants, including `PROTOCOL_VERSION`, `LEGACY_PROTOCOL_VERSION`,
and `SUPPORTED_PROTOCOL_VERSIONS`. Workspace code imports modern wire
types such as `JSONRPCResponse` directly from it. Runtime validators stay in MCP;
MCP exports server/transport interfaces without re-exporting wire definitions.
Legacy wire types are available from `@toolgrain/protocol/2025-06-18`.
The root `ProtocolResponse` type covers responses from both eras.

It has no runtime dependencies and is not published to npm. Generated server and
transport declarations reference this workspace package. Its compiled exports
point only to `dist`, like the other packages.

## MCP server implementation

Implementation responsibilities are separated:

- `server.ts` composes the server; `dispatcher.ts` selects the protocol era.
- `modern/` and `legacy/` own their request validation, method handling, and response shapes.
- `legacy/connection.ts` owns initialization/readiness and initialization cancellation rules.
- `connection.ts` owns shared transport lifecycle and writes; `pending-requests.ts` tracks cancellation.
- `protocol/` owns shared envelopes, decoding, and protocol errors.
- `tools/definition.ts` defines the public API; `tools/registry.ts` validates and executes inputs.
- `tools/schema.ts` converts schemas and metadata; `tools/adapter.ts` adapts execution.
- `tools/rich-result.ts` marks explicit results; `tools/content.ts` validates rich content.
- `tools/json-value.ts` checks JSON values; `tools/results.ts` normalizes outputs before either era shapes its wire result.

Modern modules do not depend on legacy modules. Removing legacy support would
remove its modules, schema, tests, and routing/export entries; tool definitions
and shared execution would remain the same.

The package supports `server/discover`, `tools/list`, and `tools/call` for modern
`2026-07-28` requests carrying version and client capability metadata. Legacy
clients use `initialize`, `notifications/initialized`, `ping`, `tools/list`, and
`tools/call` under `2025-06-18`. Initialization negotiates the supported legacy
revision, including when the client proposes another revision. Only these two
wire revisions are implemented. The connection handles each client era without
changing tool definitions or requiring a server mode setting.

Modern discovery lists both supported versions. Modern discovery and tool lists
use `ttlMs: 0` and `cacheScope: "private"`; legacy listings omit modern result and
cache fields. Tool lists are a single page in either era.

Tool inputs must convert to JSON Schema with an object root. Conversion uses the
schema's input shape, preserving transforms/defaults for execution. Invalid
schemas fail at server construction with `ToolSchemaError`.

Without an output schema, strings become text content; other JSON values become
structured content and JSON text in modern mode. With an output schema, parsed
strings also include structured content and serialized JSON text. Legacy structured
content is limited to objects; arrays, null, numbers, and booleans return JSON text
only. Non-JSON values fail as tool errors rather than being silently coerced.
Input/output validation and handler failures return `isError: true`; malformed
requests and unknown tools return protocol errors. Handler error messages are exposed to
clients, but stack traces are not.

`Transport` provides asynchronous `start(callbacks)`, `send(response)`, and `close()`.
Its responses use `ProtocolResponse`, covering both protocol eras.
Callbacks report decoded messages, JSON parse failures, transport errors, and EOF.
Adapters own byte framing and JSON parsing. Messages run independently; writes
are serialized. `listen()` resolves after startup. A server permits one transport
attachment, and `close()` is terminal and idempotent. Transport failures terminate
the attachment and reach the optional server `onError` callback. Diagnostics do
not write to stdout.

Each tool adapter creates one internal registry and reuses it for all executions.
Cancellation suppresses pending responses and aborts the handler's `ctx.signal`;
handlers stop early only if they observe it. A request cancelled during
validation never starts its handler. Responses already handed to an adapter
cannot be recalled.

Both complete upstream schemas are vendored unchanged at commit
`271ecc9accafdd9b83a3c869fa67c22953b2af80`, with checksum/provenance and its license
under the private `@toolgrain/protocol` workspace, in sibling revision folders
`packages/protocol/src/vendor/2026-07-28/` and `packages/protocol/src/vendor/2025-06-18/`.
Builds retain those files. Updates are explicit;
there is no build-time download or MCP SDK dependency.

Resources, prompts, multi-round-trip input-required results, subscriptions, and
extensions remain future work. All packages are private and unpublished.

## Node stdio and complete flow

`@toolgrain/node` exports `stdio()`, using the process's stdin/stdout by default.
It frames newline-delimited UTF-8 JSON, handles partial chunks, reports malformed
messages, and serializes writes with backpressure. Diagnostics belong on stderr.

`stdio({ input, output, maxMessageBytes })` accepts custom Node streams and an
incoming-message byte limit (default 1 MiB, excluding the newline). Oversized
messages terminate the transport. EOF or stream failure closes the attachment.
Explicit close removes listeners and pauses input; it does not destroy or end
caller-owned streams, or force the process to exit.

Build and launch the example:

```sh
bun run build
node apps/stdio-example/dist/index.js
```

To launch the MCP Inspector browser UI (run `bun run dev` or `bun run build` first):

```sh
bun run --cwd apps/stdio-example inspect
```

The script runs the official `@modelcontextprotocol/inspector` through `npm exec` outside the Bun-managed workspace and
pins Inspector 2.11.0 and runs the compiled server with Bun and
`--protocol-era modern` (Inspector defaults to legacy otherwise). In Inspector, connect to the server,
list tools, and call `greet` with a name. See the
[Inspector documentation](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector).

Paste this single-line request into its stdin to call `greet`:

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}},"name":"greet","arguments":{"name":"Ada"}}}
```

The response includes `structuredContent: {"message":"Hello, Ada!"}` and a text
representation. Send `server/discover` or `tools/list` with the same `_meta` to
inspect the server. Closing stdin ends the example naturally.

`bun run test` includes subprocess integration tests that launch the compiled
example and check discovery, tool listing/execution, malformed-input recovery,
error responses, and EOF shutdown in both eras. These use a small test client;
Inspector 2.11.0 and the installed Codex client are also verified over stdio and
HTTP. Codex's normal initialization-based connection requires no modern flags;
see the [compatibility report](./docs/compatibility.md) for exact tested versions.

## Streamable HTTP

`@toolgrain/http` provides `createHttpHandler(server, options?)`, a Web
`Request` → `Promise<Response>` handler. `@toolgrain/node` provides
`createNodeHttpHandler(server, options?)` for Node `IncomingMessage` and
`ServerResponse`. Both share the same HTTP implementation; neither depends on a
web framework. For a standalone Node listener, use:

```ts
import { http } from "@toolgrain/node";

await server.listen(http({ port: 3000, path: "/mcp" }));
// await server.close(); // Stops the owned listener and active requests.
```

For an existing application, mount a combined handler at its root. It routes the
configured MCP endpoint (default `/mcp`) and automatically serves public protected
resource metadata when auth is configured. `allowedHosts` defaults to loopback
hosts; configure exact public authorities for deployment. The framework owns its
listener and calls `server.close()` during shutdown.

```ts
import { createHttpHandler } from "@toolgrain/http";

const handler = createHttpHandler(server, {
  path: "/mcp",
  allowedHosts: ["api.example.com"],
  allowedOrigins: ["https://example.com"],
  maxMessageBytes: 1024 * 1024,
});

// Next.js App Router: app/mcp/route.ts
export const POST = handler;
export const GET = handler;
export const DELETE = handler;
```

```ts
import { createNodeHttpHandler } from "@toolgrain/node";

// Express: mount before express.json() or other body-consuming middleware.
app.use(createNodeHttpHandler(server));
app.use(express.json());
app.get("/health", (_request, response) => response.json({ status: "ok" }));
```

The Node middleware calls `next()` for unrelated paths before consuming their
bodies. Matched MCP errors remain Toolgrain responses. Web middleware can use
`handler.matches(pathname)` to select the MCP and metadata routes and delegate
other paths to its framework.

The public factories compose focused internal modules. HTTP separates option
normalization, endpoint checks, bounded body decoding, request/header validation,
parameter-header schema extraction, execution, and response serialization. The
Node adapter separates request conversion, connection abort tracking, and response
writing with backpressure. HTTP protocol behavior stays in `@toolgrain/http`;
Node modules only adapt the runtime interfaces. No generic utility package is
needed for these responsibilities.

Within HTTP, `modern/` and `legacy/` contain each era's version/header validation,
notification rules, and response policies. `protocol-version.ts` selects one
adapter per POST; body decoding, routing/parameter-header comparison, execution,
and JSON serialization are shared.

HTTP supports revisions `2026-07-28` and `2025-06-18`: independent POST requests
and JSON responses. Legacy initialization is supported without issuing session
IDs or keeping global client negotiation state. There is no GET event stream or
resumption. SSE, progress, and subscriptions remain separate work. See
[authorization](./docs/authorization.md) for JWT/Clerk and request identities. Requests must advertise both `application/json` and
`text/event-stream` in Accept even though this implementation returns JSON.

Every modern POST carries `MCP-Protocol-Version`, `Mcp-Method`, and, for tool calls,
`Mcp-Name`. Header values must match the JSON-RPC body. Encoded names and declared
`x-mcp-header` parameter annotations are validated before tool execution; invalid
annotations fail HTTP-handler construction. Missing or mismatched headers return
HTTP 400 / `HeaderMismatch`; unsupported versions return HTTP 400 with supported
versions; unsupported RPC methods return HTTP 404. GET and DELETE return 405.
Legacy `initialize` can omit the version header and declares its requested version
in `params.protocolVersion`. Subsequent legacy POSTs carry
`MCP-Protocol-Version: 2025-06-18`; modern routing headers are optional but checked
against the body when present. Contradictory header/body versions are rejected.
Legacy JSON-RPC method/argument errors use HTTP 200, while malformed transport
messages still fail with HTTP errors. Legacy `notifications/initialized` and
valid `notifications/cancelled` return HTTP 202 with no body. Cancellation is
advisory: without a session or client identity, an independent notification
cannot safely target another HTTP request, so it does not cancel shared work.
Modern HTTP notifications remain unsupported.

`maxMessageBytes` defaults to 1 MiB and limits incoming bytes, not output size.
Bodies use strict UTF-8 decoding. Invalid JSON returns 400; oversized bodies return
413. Already consumed bodies are rejected. Each HTTP request has its own execution
scope, so concurrent callers can use the same JSON-RPC ID safely. Disconnects
suppress the corresponding result; running validation and handlers continue under
the existing tool execution semantics.

An absent Origin is allowed. A present Origin must exactly match an entry in
`allowedOrigins`, which defaults to an empty list. This is independent of CORS and
authentication: applications own browser preflight handling, TLS, deployment
configuration, and framework HTTP-server shutdown. Toolgrain owns MCP routing,
host validation, and optional JWT/Clerk verification. Set explicit origins
when using a browser client. The plain Node example binds to `127.0.0.1`.

The MCP server exposes `handle(message, { signal?, protocolVersion? })` for independent decoded
messages and `getToolDefinitions()` for fresh copies of advertised metadata.
The HTTP adapter passes the validated revision per request; direct legacy
callers supply `protocolVersion: LEGACY_PROTOCOL_VERSION` after initialization.
Request processing shares dispatch/error conversion with stdio. `close()` is
terminal and suppresses pending results across both paths; attached-transport EOF
also closes the server. A listener attached through `http()` closes with the MCP
server; externally mounted handlers leave the listener application-owned.

Run the plain Node example after building:

```sh
bun run build
bun run --cwd apps/http-example start
```

The endpoint is `http://127.0.0.1:3000/mcp`. See
[independent framework examples](./apps/README.md) for verified Express,
Hono, Elysia, and Next.js integrations. Framework dependencies live only
in their respective example workspaces. NestJS is not separately verified.

## Development

Use two terminals from the repository root:

```sh
# Terminal 1: run every package and app's dev task.
bun run dev

# Terminal 2: launch Inspector against the compiled stdio example.
bun run --cwd apps/stdio-example inspect
```

Root `dev` runs `turbo run dev --concurrency=16`, without a filter. The limit
allows all library watchers and example servers to stay running. Library workspaces run their own
TypeScript watch build: changes in `src` emit updated JavaScript and declarations
to `dist`. Initial library builds run in dependency order before watchers and app
development servers start so package imports resolve even on a clean checkout.
Framework examples use their native development commands; Next.js uses the Next
CLI, and Elysia runs on Bun. See [examples](./apps/README.md). The protocol build also prepares vendor files.

All package exports point to `dist`; source files are not exposed through a custom
export condition. After a successful rebuild, disconnect and reconnect in Inspector
to start a fresh Bun server using the updated compiled files. Compilation output
stays in the dev terminal, separate from MCP stdout. The example dev task only
watches/builds; Inspector is a separate script.

Libraries use `tsc` for builds and type checks; examples use their framework
build commands and TypeScript checks. Individual workspace `dev` commands
run only that workspace; root `dev` starts all of them.

Use Bun 1.3.14 and the Node version declared in `package.json`.

```sh
bun install --frozen-lockfile
bun run check
bun run check-types
bun run test
bun run test:coverage
bun run test:examples
bun run build
bun run test:package
bun run test:size
bun run test:audit
bun run test:ci
bun run check:fix
bun run format
```

Biome is installed and configured once at the repository root. Its configuration
applies across apps and packages; installed skills are excluded from checks.

- `packages/protocol/`: private pinned wire schema/constants, provenance, and license.
- `packages/mcp/`: tool authoring, validation/execution, protocol handling, and transport contract.
- `packages/http/`: runtime-independent Streamable HTTP and Web handler.
- `packages/node/`: Node stdio transport and HTTP adapter.
- `apps/stdio-example/`: runnable server and subprocess integration tests.
- `apps/http-example/`: plain Node HTTP server.
- Other `apps/*-example/` workspaces: independent Express, Hono, Elysia, and Next.js applications.
- Packages compile ESM/declarations with TypeScript and use Vitest.
- `apps/`: examples and future documentation applications.
- `tsconfig.base.json`: shared strict TypeScript defaults; future workspaces extend
  it and define their own input files, output paths, and runtime-specific options.
- `turbo.json`: build, test, and type-check orchestration for future workspaces.

The starter applications, UI/logger packages, ESLint, Prettier, and Jest presets
have been removed. Library build, test, and type-check tasks run through Turbo.

## Continuous integration

GitHub Actions runs `bun install --frozen-lockfile` and `bun run check` on pull
requests and pushes to `main`. The workflow reads the Bun version from
`package.json`. It also runs type checks, library coverage, uninstrumented example smoke tests, builds, and a compiled-package import and
declaration smoke check using Node 24.20.0.

MCP package verification reuses its compiled consumer and runtime fixtures in
isolated temporary directories. It checks TypeScript 5.5.4 and the development
compiler against both Zod 4.0.0 and the development Zod version, including Classic
and Mini inference and rejected definitions. Runtime checks run once per Zod
version under Node with source maps enabled and check a TypeScript stack location.
The isolated MCP copy includes its sources. Pinned compatibility dependencies are development tooling;
verification requires no additional downloads or workspace dependency changes.

Root `bun run test:package` also schedules an uncached clean installation task
after the six library package checks. Turbo flags such as `--filter`, `--force`,
and `--dry=json` retain their normal behavior. A package filter that excludes the
root excludes this installation task, too; dry runs perform no installations.

The check packs all six libraries with Bun and serves their unchanged archives
through a temporary loopback registry scoped to `@toolgrain`. Six fresh npm
consumers each install one library as their only direct Toolgrain dependency,
letting npm resolve its declared dependencies and versions. Each imports the
installed library and checks its declaration fixture with strict TypeScript and
`skipLibCheck: false`. This catches dependencies hidden by installing every
library together. A separate full consumer exercises both protocol revisions
over stdio, Web HTTP, Node HTTP, and the managed HTTP transport, including input
validation, rich results, and a context provider. JWT and Clerk initialize with
test configuration; no live credentials or external authorization calls are used.

This check needs npm, tar, registry access for external dependencies, and loopback
access. Zod, TypeScript, and Node types use their development versions, and all
consumers share a disposable npm cache. Workspace links and unresolved local
runtime dependencies are rejected. Temporary files and listeners are cleaned up;
a pass/fail report is saved to `reports/clean-install.json` in the existing CI
artifact. After building, run just this check with `bun run test:clean-install`
or `node packages/repo-tools/src/cli.mjs clean-install`. Nothing is published.

### Coverage checks

`bun run test:coverage` runs through Turborepo, building each workspace before
its tests. MCP, Node, and HTTP use Vitest V8 coverage over every `src/**/*.ts`
file, including files not imported by tests. Thresholds apply separately to
statements, branches, functions, and lines in each package: 95% for MCP, Node, HTTP, JWT, and Clerk. A test failure or missed threshold fails CI.

Protocol runs its vendored-schema integrity test without instrumenting upstream
code. Examples run their real-process integration tests through `bun run test:examples`,
separately from library coverage. They have no coverage instrumentation or floors. Type-only and
re-export-only modules have no executable statements to measure.

Reports are written to each measured package's `coverage/` directory: terminal
summary, HTML (`coverage/index.html`), LCOV, and JSON summary. Turbo caches and
restores these reports using `outputs: ["coverage/**"]`. CI uploads available
reports as the `test-and-coverage-reports` artifact, including after test failures, for
14 days. Ordinary `bun run test` remains available without instrumentation.
Reports are generated even when tests fail (`reportOnFailure: true`).
The 95% floors leave room for defensive paths without requiring contrived tests.
Coverage measures executed code, not assertion quality or complete behavior.

CI also writes JSON test results for every workspace and a combined Actions
summary showing check outcomes, failed tests, and coverage against thresholds.
Independent test suites continue after another suite fails. The same report is
posted as a PR comment for branches in this repository by a separate job with
PR write permission; test execution retains read-only permissions. Fork PRs use
the Actions summary and downloadable artifact. Reports link to the run logs.

### Package size and dependency auditing

`bun run test:size` builds and checks the six library packages through Turbo.
Each check packs the workspace with Bun 1.3.14 into a temporary directory,
without running lifecycle scripts or publishing anything. It measures compressed
tarball bytes, unpacked file bytes, and file count, and writes the complete file
inventory and result to `packages/<name>/reports/size.json`. Runtime dependencies
are not included in these sizes. Required protocol schemas, licenses, and
provenance remain included.

`package-size.config.json` sets a packed and unpacked byte budget for each
library. Initial budgets allow approximately 20% growth above the current build,
rounded up to KiB. Either exceeded budget fails CI. The archive must retain every
declared export target, every compiled JavaScript/declaration file in `dist`, and
the protocol's schemas, licenses, and provenance explicitly listed in the config.
Missing required files and unexpected package files fail the check. Intentional growth
requires reviewing and updating the relevant budget. Size checks run uncached
to inspect the actual package contents on every run. They depend on the libraries'
own builds and still run when an unrelated application build fails.

MCP's `sourceMaps` size policy additionally requires JavaScript maps, declaration
maps, and the TypeScript sources in the archive. Verification rejects malformed
maps, missing or incorrect source targets, and missing mapping comments. Packaged
sources are limited to existing `src/**/*.ts` files; other libraries retain their
existing restrictions. MCP's budgets are 69 KiB packed and 296 KiB unpacked,
allowing approximately 20% growth above the build with maps and sources.

`bun run test:audit` queries Bun's advisory service once for the complete
`bun.lock`, then attributes known advisories to each workspace using its locked
dependency graph and affected version ranges. Reports separate runtime
dependencies (including optional and peer dependencies) from development-only
findings. A workspace's development scope includes its own dev dependencies,
but not the dev dependencies of libraries it consumes. Root tooling and every
example receive their own reports as well.

The audit writes `reports/audit.json` at the root and in every workspace,
plus `reports/audit-advisories.json` and `reports/audit-lockfile.json` for the
complete scan. High/critical advisories anywhere in the lockfile fail CI;
low/moderate advisories remain visible without blocking. Network, process,
malformed-response, and dependency-resolution errors fail CI and produce error
reports. Failed scanner responses retain stderr in the reports and CI logs.
Workspace report destinations are discovered from `package.json` before reading
the lockfile. Missing, unreadable, malformed, or structurally invalid lockfiles
replace previous workspace/lockfile reports with errors and discard stale raw
advisory data without invoking the scanner.
Audits run outside Turbo caching because advisories change independently
of the repository. The command does not install fixes or change dependencies.

CI includes both tables and advisory details in the existing Actions summary
and same-repository PR comment. JSON inventories and audit details join the
`test-and-coverage-reports` artifact, retained for 14 days, including on failure.
Only test JSON is included in test-task report caching, so cache restores cannot
replace a fresh audit. `bun run test:ci` verifies the check and reporting scripts,
including failure cases. Report rendering is tested with Node, matching CI. A
malformed JSON report or invalid report schema produces a diagnostic row or
report-error entry, preserves healthy results and the Actions/PR summary, and
fails the rendering step after writing that summary. Dependency auditing checks known advisories; it does not
establish whether application code can reach a vulnerable path.
