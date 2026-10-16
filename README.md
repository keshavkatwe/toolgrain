# Toolgrain

A TypeScript toolkit for building MCP servers, implemented independently of
`@modelcontextprotocol/sdk`.

The first `@toolgrain/core` package provides typed tool definitions, Zod 4 input
validation, and direct execution. `@toolgrain/mcp` adds discovery and tool
requests for MCP `2026-07-28`. The Node stdio adapter and Web/Node HTTP handlers provide complete server flows. See [AGENTS.md](./AGENTS.md) for project decisions.

## Core package

```ts
import { createRegistry, tool } from "@toolgrain/core";
import { z } from "zod";

const greet = tool({
  description: "Greet someone",
  input: z.object({ name: z.string() }),
  execute({ name }) {
    return { message: `Hello, ${name}!` };
  },
});

const registry = createRegistry({ greet });
const result = await registry.execute("greet", { name: "Ada" });
```

Registration keys supply tool names. `list()` returns fresh metadata entries with
the original schemas. Execution accepts unknown input, applies asynchronous Zod
validation (including transforms and defaults), and returns handler values unchanged.
Handlers can be synchronous or asynchronous and receive only parsed input.

Unknown names reject with `UnknownToolError`; validation failures reject with
`ToolInputError`, exposing `toolName`, `issues`, and the original Zod error as
`cause`. Handler failures propagate unchanged. Literal names infer their output
type; dynamic strings infer the union of registered outputs.

The package is private and unpublished. Build it before importing its compiled
entry point in another workspace.

## Internal protocol package

`@toolgrain/protocol` is a private workspace package containing the pinned official
schema and constants, including `PROTOCOL_VERSION`. Workspace code imports wire
types such as `JSONRPCResponse` directly from it. Runtime validators stay in MCP;
MCP exports server/transport interfaces without re-exporting wire definitions.

It has no runtime dependencies and is not published to npm. Generated server and
transport declarations reference this workspace package. Its compiled exports
point only to `dist`, like the other packages.

## MCP server package

```ts
import { tool } from "@toolgrain/core";
import { createServer } from "@toolgrain/mcp";
import { stdio } from "@toolgrain/node";
import { z } from "zod";

const server = createServer({
  name: "hello-server",
  version: "1.0.0",
  tools: {
    greet: tool({
      input: z.object({ name: z.string() }),
      execute: ({ name }) => ({ message: `Hello, ${name}!` }),
    }),
  },
});

await server.listen(stdio());
await server.close();
```

Implementation responsibilities are separated:

- `server.ts` composes the server; `dispatcher.ts` routes MCP methods.
- `handlers.ts` implements discovery, tool listing, and tool calls.
- `connection.ts` owns transport lifecycle and writes; `pending-requests.ts` tracks cancellation.
- `protocol/` owns metadata validation, message decoding, and response envelopes.
- `tool-schema.ts` converts schemas; `tools.ts` adapts core execution.
- `json-value.ts` checks JSON values; `results.ts` converts them into tool results.

The package supports `server/discover`, `tools/list`, and `tools/call`. Every
request requires version and client capability metadata; there is no initialization
handshake. Only revision `2026-07-28` is supported. Discovery and tool lists use
`ttlMs: 0` and `cacheScope: "private"`; the tool list is a single page.

Tool inputs must convert to JSON Schema with an object root. Conversion uses the
schema's input shape, preserving transforms/defaults for execution. Invalid
schemas fail at server construction with `ToolSchemaError`.

Strings become text content; other JSON values become structured content and JSON
text. Non-JSON values fail as tool errors rather than being silently coerced.
Input validation and handler failures return `isError: true`; malformed requests
and unknown tools return protocol errors. Handler error messages are exposed to
clients, but stack traces are not.

`Transport` provides asynchronous `start(callbacks)`, `send(response)`, and `close()`.
Callbacks report decoded messages, JSON parse failures, transport errors, and EOF.
Adapters own byte framing and JSON parsing. Messages run independently; writes
are serialized. `listen()` resolves after startup. A server permits one transport
attachment, and `close()` is terminal and idempotent. Transport failures terminate
the attachment and reach the optional server `onError` callback. Diagnostics do
not write to stdout.

Each tool adapter creates one core registry and reuses it for all executions.
Cancellation suppresses pending responses, but does not interrupt validation or
handler execution once registry execution starts. Cancellation during validation
can therefore still allow the handler to run. Responses already handed to an
adapter cannot be recalled.

The complete upstream schema is vendored unchanged at commit
`271ecc9accafdd9b83a3c869fa67c22953b2af80`, with checksum/provenance and its license
under the private `@toolgrain/protocol` workspace (`packages/protocol/src/vendor`). Builds retain those files. Updates are explicit;
there is no build-time download or MCP SDK dependency.

Resources, prompts, subscriptions, extensions, and rich-content helpers
remain future work. All packages are private and unpublished.

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
error responses, and EOF shutdown. These use a small test client; Inspector 2.11.0 has also been verified for discovery, listing, and greeting
execution in modern protocol mode.

## Streamable HTTP

`@toolgrain/http` provides `createHttpHandler(server, options?)`, a Web
`Request` → `Promise<Response>` handler. `@toolgrain/node` provides
`createNodeHttpHandler(server, options?)` for Node `IncomingMessage` and
`ServerResponse`. Both share the same HTTP implementation; neither depends on a
web framework. HTTP handlers are mounted directly, without `server.listen()`.

```ts
import { createHttpHandler } from "@toolgrain/http";

const handler = createHttpHandler(server, {
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
app.all("/mcp", createNodeHttpHandler(server));
```

The public factories compose focused internal modules. HTTP separates option
normalization, endpoint checks, bounded body decoding, request/header validation,
parameter-header schema extraction, execution, and response serialization. The
Node adapter separates request conversion, connection abort tracking, and response
writing with backpressure. HTTP protocol behavior stays in `@toolgrain/http`;
Node modules only adapt the runtime interfaces. No generic utility package is
needed for these responsibilities.

HTTP supports only revision `2026-07-28`: independent POST requests and JSON
responses. There is no initialization handshake, session, GET event stream, or
resumption. SSE, progress, subscriptions, OAuth/Clerk, and request identity context
are separate work. Normal requests must advertise both `application/json` and
`text/event-stream` in Accept even though this implementation returns JSON.

Every POST carries `MCP-Protocol-Version`, `Mcp-Method`, and, for tool calls,
`Mcp-Name`. Header values must match the JSON-RPC body. Encoded names and declared
`x-mcp-header` parameter annotations are validated before tool execution; invalid
annotations fail HTTP-handler construction. Missing or mismatched headers return
HTTP 400 / `HeaderMismatch`; unsupported versions return HTTP 400 with supported
versions; unsupported RPC methods return HTTP 404. GET and DELETE return 405.
No client-to-server notifications are currently accepted over HTTP.

`maxMessageBytes` defaults to 1 MiB and limits incoming bytes, not output size.
Bodies use strict UTF-8 decoding. Invalid JSON returns 400; oversized bodies return
413. Already consumed bodies are rejected. Each HTTP request has its own execution
scope, so concurrent callers can use the same JSON-RPC ID safely. Disconnects
suppress the corresponding result; running validation and handlers continue under
the existing core execution semantics.

An absent Origin is allowed. A present Origin must exactly match an entry in
`allowedOrigins`, which defaults to an empty list. This is independent of CORS and
authentication: applications own browser preflight handling, access checks,
routing, TLS, binding addresses, and HTTP-server shutdown. Set explicit origins
when using a browser client. The plain Node example binds to `127.0.0.1`.

The MCP server now exposes `handle(message, { signal? })` for independent decoded
messages and `getToolDefinitions()` for fresh copies of advertised metadata.
Request processing shares dispatch/error conversion with stdio. `close()` is
terminal and suppresses pending results across both paths; attached-transport EOF
also closes the server. The HTTP listener remains application-owned.

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
bun run check:fix
bun run format
```

Biome is installed and configured once at the repository root. Its configuration
applies across apps and packages; installed skills are excluded from checks.

- `packages/protocol/`: private pinned wire schema/constants, provenance, and license.
- `packages/core/`: tool execution library.
- `packages/mcp/`: protocol validation, server dispatch, and transport contract.
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
have been removed. Core build, test, and type-check tasks run through Turbo.

## Continuous integration

GitHub Actions runs `bun install --frozen-lockfile` and `bun run check` on pull
requests and pushes to `main`. The workflow reads the Bun version from
`package.json`. It also runs type checks, library coverage, uninstrumented example smoke tests, builds, and a compiled-package import and
declaration smoke check using Node 24.20.0.

### Coverage checks

`bun run test:coverage` runs through Turborepo, building each workspace before
its tests. Core, MCP, Node, and HTTP use Vitest V8 coverage over every `src/**/*.ts`
file, including files not imported by tests. Thresholds apply separately to
statements, branches, functions, and lines in each package: 100% for core and 95% for MCP, Node, and HTTP. A test failure or missed threshold fails CI.

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
