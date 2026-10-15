# Toolgrain: agent instructions and project context

Updated: 2026-10-14

## Working agreement

- Never create a commit unless the user explicitly asks. Authorization applies to the requested commit, not future changes.

- We are not using gstack. Use ordinary project files for context and instructions.
- Work one step at a time with the user. The product and API are still being designed; do not treat the roadmap below as authorization to implement everything.
- This is the new Toolgrain repository. Build from scratch here, without depending on `@modelcontextprotocol/sdk`.
- Leave the previous repository at `/Users/shridhar/Documents/ChatGPT/typescript-mcp-framework` untouched. Do not copy or migrate its implementation unless requested.
- Repository cleanup and root-level Biome setup are authorized. MCP implementation, publication, and deployment remain separate steps.
- Keep confirmed decisions separate from proposals. Update this context as the user makes decisions.

## Product direction

Toolgrain is a TypeScript toolkit for building MCP servers with a simple, typed developer API. Implement MCP support directly against protocol revision `2026-07-28`. Older specification revisions are unsupported for now. Owning that implementation means owning compatibility, interoperability testing, and protocol maintenance.

A protocol-independent tool execution core is the proposed architecture. Ease of defining and composing tools is the intended product value; SDK independence gives us control over the implementation.

## Confirmed MCP protocol target

- Implement MCP revision `2026-07-28` first.
- Do not add compatibility with older specification revisions for now.
- Reference: https://modelcontextprotocol.io/docs/2026-07-28/getting-started/intro

## Naming and hosting

- Product name: Toolgrain.
- The user has created the `toolgrain` npm organization, providing the `@toolgrain` scope.
- Scoped packages are sufficient. A separate unscoped `toolgrain` package is optional and is not reserved by organization creation.
- Use GitHub and GitHub Pages. No custom domain purchase is planned.
- Package names below are proposals, not published packages or finalized boundaries.

## Proposed developer API

The user accepted this as a starting idea. It is not implemented or finalized.

```ts
import { tool } from "@toolgrain/core";
import { createServer } from "@toolgrain/mcp";
import { stdio } from "@toolgrain/node";
import { z } from "zod";

const greet = tool({
  description: "Greet someone by name",
  input: z.object({
    name: z.string().min(1),
  }),
  async execute({ name }) {
    return { message: `Hello, ${name}!` };
  },
});

const server = createServer({
  name: "hello-server",
  version: "1.0.0",
  tools: { greet },
});

await server.listen(stdio());
```

Proposed semantics:

- Registration keys define exposed tool names.
- Tool definitions are independent and reusable across servers.
- Input types are inferred, with runtime argument validation.
- Ordinary strings and JSON values are converted into MCP tool results.
- Explicit helpers could support images and other rich MCP content.
- Transport selection is explicit.
- Zod 4 is the initial schema library. Independence from the MCP SDK does not mean zero dependencies.

## Rough roadmap for discussion

1. Refine API examples and agree on the smallest useful scope.
2. Build a protocol-independent core for tool definitions and execution.
3. Implement MCP messages, lifecycle, capabilities, and errors for protocol revision `2026-07-28`.
4. Start with tool discovery and execution over stdio, then consider Streamable HTTP.
5. Test interoperability with real MCP clients before expanding into resources, prompts, and other features.

This roadmap is a proposal, not a committed implementation plan.

## Confirmed core package decisions

- `@toolgrain/core` is implemented in `packages/core`, version `0.0.0`, private and unpublished.
- `tool()` defines reusable tools; `createRegistry()` snapshots named registrations and provides `list()` and asynchronous `execute(name, unknownInput)`.
- Zod 4 is a peer dependency. Validation uses asynchronous parsing; handlers receive the schema's parsed output, including transforms and defaults.
- Handler outputs remain unchanged. MCP result conversion belongs to a future protocol layer.
- Unknown names and invalid input reject with `UnknownToolError` and `ToolInputError`; handler failures propagate unchanged.
- Literal names infer specific output types; dynamic names infer the union of registered outputs.
- No handler context, output validation, MCP messages, transports, or server facade yet.
- Build ESM and declarations with TypeScript; use Vitest and compile-time type checks. CI also verifies compiled imports and declarations.

## Confirmed protocol package decisions

- `@toolgrain/protocol` is a private workspace package, version `0.0.0`, owning the unchanged upstream schema, protocol constants, provenance, and license.
- Import wire definitions and `PROTOCOL_VERSION` directly from protocol. MCP does not re-export them. Keep runtime validators and method handling in MCP.
- Protocol has no runtime dependencies and uses the same compiled dist exports, build, watch, test, and declaration checks as other packages.
- Vendored source is excluded from rewriting and verified by checksum. Protocol builds retain upstream license/provenance/schema files in dist.

## Confirmed MCP package decisions

- `@toolgrain/mcp` is implemented in `packages/mcp`, version `0.0.0`, private and unpublished.
- The private `@toolgrain/protocol` package owns the full official `2026-07-28` schema unchanged from commit `271ecc9accafdd9b83a3c869fa67c22953b2af80`, with checksum, provenance, and upstream license. Do not format or modify the vendored source. Updates require explicit review.
- `createServer({ name, version, tools, instructions?, onError? })` supports discovery, tool listing/calling, and `listen(transport)` / terminal, idempotent `close()`.
- Requests carry version and client capabilities individually; no initialization handshake or support for older revisions.
- Tool schemas convert with Zod's input-mode JSON Schema 2020-12 conversion and require an object root. Fail unrepresentable schemas at construction.
- Strings become text; other JSON values become structured content plus text. Reject unsupported output values as tool errors.
- Input validation and handler failures are tool results with `isError`; unknown tools and invalid protocol messages use protocol errors.
- Discovery/list results use `ttlMs: 0`, `cacheScope: "private"`. Tool lists are a single page; nonempty cursors are rejected.
- Cancellation is best effort; handlers receive no context and cannot be interrupted after invocation.
- Keep MCP responsibilities separate: server composition, method dispatch/handlers, protocol validation/envelopes, connection lifecycle, cancellation tracking, schema conversion, execution adaptation, and result conversion.
- A runtime-independent transport contract separates message handling from framing. Tests use an in-memory adapter. Stdio is implemented separately in `@toolgrain/node`.
- Resources, prompts, subscriptions, extensions, rich-content helpers, publication, and deployment remain separate steps.

## Confirmed Node stdio decisions

- `@toolgrain/node` exports `stdio({ input?, output?, maxMessageBytes? })`, defaulting to process stdin/stdout and a 1 MiB incoming-message limit.
- Keep byte framing, writable backpressure, and transport lifecycle in separate modules. The adapter contains no MCP method handling.
- Newline-delimited UTF-8 JSON; malformed JSON/UTF-8 reports parse errors and permits later messages. Oversized frames terminate the transport.
- Close detaches listeners and pauses input without ending/destroying supplied streams or calling process.exit. EOF is the normal shutdown signal.
- `apps/stdio-example` demonstrates a full server, with subprocess tests using compiled packages over actual stdin/stdout. Inspector 2.11.0 was verified in modern protocol mode: discovery, tool listing, and greet execution over stdio pass.

## Repository state and next step

Core and the private protocol package are merged into `main`; MCP is committed on `codex/mcp-package` at `18ebca6`. Node stdio work is on `codex/node-stdio`, branched from that MCP commit. Keep Bun 1.3.14, pinned Turbo, root-level Biome, and shared strict TypeScript defaults. The stdio server example is runnable in `apps/stdio-example`.

Before changing Turborepo configuration or commands, resolve the installed `turbo` package from the relevant workspace and read its bundled `docs/README.md` and relevant documentation.

Next, review the complete stdio flow. The example Inspector launcher pins version 2.11.0 and selects modern protocol mode. No commits, publication, or deployment are authorized by implementation alone.

## Development loop

- Root dev is `turbo run dev` without a filter: run every package/app dev task.
- Each workspace dev task watches src with tsc and writes JavaScript/declarations to dist. Initial builds complete in dependency order before watch tasks start.
- All public package exports point to dist. Do not add a development/source export condition.
- Inspector is a separate example script, launching the compiled server with Bun in modern protocol mode. Reconnect after successful rebuilds to use updated compiled modules.
- The example has no hot-reload global server state. Keep build output separate from MCP stdout.
