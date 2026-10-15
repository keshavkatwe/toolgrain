# Toolgrain

A TypeScript toolkit for building MCP servers, implemented independently of
`@modelcontextprotocol/sdk`.

The first `@toolgrain/core` package provides typed tool definitions, Zod 4 input
validation, and direct execution. `@toolgrain/mcp` adds discovery and tool
requests for MCP `2026-07-28`. Stdio and HTTP adapters are not implemented yet. See [AGENTS.md](./AGENTS.md) for project decisions.

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

## MCP server package

```ts
import { tool } from "@toolgrain/core";
import { createServer } from "@toolgrain/mcp";
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

// Supply an adapter implementing Transport; stdio will follow in @toolgrain/node.
await server.listen(transport);
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

Cancellation discards pending responses and prevents invocation after asynchronous
validation. Already-running handlers cannot be interrupted with the current core
API. Responses already handed to an adapter cannot be recalled.

The complete upstream schema is vendored unchanged at commit
`271ecc9accafdd9b83a3c869fa67c22953b2af80`, with checksum/provenance and its license
under `packages/protocol/src/vendor`. Builds retain those files. Updates are explicit;
there is no build-time download or MCP SDK dependency.

Resources, prompts, subscriptions, extensions, rich-content helpers, and production
transports remain future work. Both packages are private and unpublished.

## Development

Use Bun 1.3.14 and the Node version declared in `package.json`.

```sh
bun install --frozen-lockfile
bun run check
bun run check-types
bun run test
bun run build
bun run --cwd packages/core test:package
bun run --cwd packages/mcp test:package
bun run check:fix
bun run format
```

Biome is installed and configured once at the repository root. Its configuration
applies across apps and packages; installed skills are excluded from checks.

- `packages/core/`: tool execution library.
- `packages/mcp/`: protocol validation, server dispatch, and transport contract.
- Both packages compile ESM/declarations with TypeScript and use Vitest.
- `apps/`: future examples or documentation applications.
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
