# Toolgrain

A TypeScript toolkit for building MCP servers, implemented independently of
`@modelcontextprotocol/sdk`.

The first `@toolgrain/core` package provides typed tool definitions, Zod 4 input
validation, and direct execution. MCP support and transports are not implemented
yet. See [agent.md](./agent.md) for project decisions.

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

## Development

Use Bun 1.3.14 and the Node version declared in `package.json`.

```sh
bun install --frozen-lockfile
bun run check
bun run check-types
bun run test
bun run build
bun run --cwd packages/core test:package
bun run check:fix
bun run format
```

Biome is installed and configured once at the repository root. Its configuration
applies across apps and packages; installed skills are excluded from checks.

- `packages/core/`: ESM library compiled with TypeScript; tests use Vitest.
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
