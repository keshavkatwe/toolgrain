# Toolgrain

A TypeScript toolkit for building MCP servers, implemented independently of
`@modelcontextprotocol/sdk`.

The first `@toolgrain/core` package provides typed tool definitions, Zod 4 input
validation, and direct execution. `@toolgrain/mcp` adds discovery and tool
requests for MCP `2026-07-28`. The Node stdio adapter provides a complete server flow; HTTP remains future work. See [AGENTS.md](./AGENTS.md) for project decisions.

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

Resources, prompts, subscriptions, extensions, rich-content helpers, and HTTP
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

## Development

Use two terminals from the repository root:

```sh
# Terminal 1: run every package and app's dev task.
bun run dev

# Terminal 2: launch Inspector against the compiled stdio example.
bun run --cwd apps/stdio-example inspect
```

Root `dev` is `turbo run dev`, without a filter. Every workspace runs its own
TypeScript watch build: changes in `src` emit updated JavaScript and declarations
to `dist`. Initial builds run in dependency order before watchers start so package
imports resolve even on a clean checkout. The protocol build also prepares vendor files.

All package exports point to `dist`; source files are not exposed through a custom
export condition. After a successful rebuild, disconnect and reconnect in Inspector
to start a fresh Bun server using the updated compiled files. Compilation output
stays in the dev terminal, separate from MCP stdout. The example dev task only
watches/builds; Inspector is a separate script.

`build` and `check-types` continue to use `tsc`. Individual workspace `dev` commands
watch/build only that workspace; root `dev` starts all of them.

Use Bun 1.3.14 and the Node version declared in `package.json`.

```sh
bun install --frozen-lockfile
bun run check
bun run check-types
bun run test
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
- `packages/node/`: Node stdio transport.
- `apps/stdio-example/`: runnable server and subprocess integration tests.
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
`package.json`. It also runs type checks, Vitest, builds, and a compiled-package import and
declaration smoke check using Node 24.20.0.
