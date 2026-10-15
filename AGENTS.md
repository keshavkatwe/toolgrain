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
import { createServer, tool } from "@toolgrain/core";
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
- Zod is illustrative; schema library support is undecided. Independence from the MCP SDK does not mean zero dependencies.

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

- `@toolgrain/protocol` is a private workspace package containing official MCP `2026-07-28` wire definitions and constants, with no runtime dependencies.
- Vendor the schema unchanged from commit `271ecc9accafdd9b83a3c869fa67c22953b2af80`, retaining provenance, SHA-256 checksum, and upstream license. Do not format or modify vendor files; updates require explicit review.
- Export compiled JavaScript and declarations from dist only. The protocol package includes no runtime validators, server implementation, or transports.
- Runtime validators belong to the future MCP package; other workspaces should import wire definitions directly from protocol.

## Repository state and next step

Core is merged into main. The private protocol package is being introduced independently on `codex/protocol-package`. Keep Bun 1.3.14, pinned Turbo, root-level Biome, and shared strict TypeScript defaults. The earlier server example remains a proposal for later work.

Before changing Turborepo configuration or commands, resolve the installed `turbo` package from the relevant workspace and read its bundled `docs/README.md` and relevant documentation.

Next, review the core API with the user before planning MCP support. The protocol target is `2026-07-28`; schema-to-JSON conversion, result conversion, and transport boundaries remain open. No commits, publication, or deployment are authorized by core implementation alone.
