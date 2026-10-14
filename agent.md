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

Toolgrain is a TypeScript toolkit for building MCP servers with a simple, typed developer API. Implement MCP support directly against an explicitly selected protocol revision. Owning that implementation means owning compatibility, interoperability testing, and protocol maintenance.

A protocol-independent tool execution core is the proposed architecture. Ease of defining and composing tools is the intended product value; SDK independence gives us control over the implementation.

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
3. Implement MCP messages, lifecycle, capabilities, and errors for an explicit protocol revision.
4. Start with tool discovery and execution over stdio, then consider Streamable HTTP.
5. Test interoperability with real MCP clients before expanding into resources, prompts, and other features.

This roadmap is a proposal, not a committed implementation plan.

## Repository state and next step

The user has created this repository and made it the primary project. The starter apps and packages have been removed. Keep Bun 1.3.14, pinned Turbo, root-level Biome, and a shared root `tsconfig.base.json`. No Jest presets or test runner are installed. `apps/` and `packages/` are placeholders for future workspaces. The Turborepo skill is installed under `.agents/skills/turborepo`; it is independent of gstack.

Before changing Turborepo configuration or commands, resolve the installed `turbo` package from the relevant workspace and read its bundled `docs/README.md` and relevant documentation. Do not assume behavior from a different version.

Next, agree with the user on one small implementation or design step. Open decisions include:

- Schema library support.
- Final package boundaries and API names.
- Tool result conversion and rich content helpers.
- Supported MCP protocol revision.
- Initial transport and feature scope.
- Test runner and package build tooling when the first package is introduced.
