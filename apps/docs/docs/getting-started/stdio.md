# Your first tool

Create one typed tool, register it on a server, and expose it over stdio. This tutorial assumes TypeScript familiarity; [installation](installation.md) explains requirements and the current unpublished state.

## 1. Define the tool

```ts title="src/tools/greet.ts"
import { tool } from "@toolgrain/mcp";
import { z } from "zod";

export const greet = tool({
  title: "Greeting",
  description: "Greet someone by name",
  annotations: { readOnlyHint: true },
  input: z.object({ name: z.string().min(1) }),
  output: z.object({ message: z.string() }),
  execute: ({ name }) => ({ message: `Hello, ${name}!` }),
});
```

The handler's input type comes from the schema. A nonempty string is required; invalid input is rejected before execution. The output schema checks the returned object too.

## 2. Compose the server

```ts title="src/server.ts"
import { createServer } from "@toolgrain/mcp";
import { stdio } from "@toolgrain/node";
import { greet } from "./tools/greet.js";

const server = createServer({
  name: "hello-server",
  version: "1.0.0",
  tools: { greet },
});

await server.listen(stdio());
```

The registration key `greet` becomes the exposed name. A definition can be reused in another server without rewriting it. `listen()` starts the transport; it does not wait for the server to shut down.

## 3. Run it through a client

After compiling, configure your MCP client to launch `node` with the absolute path to `dist/server.js`. A stdio server speaks through stdin/stdout; running it in a terminal may appear to wait silently because it is waiting for protocol messages.

For the current repository example:

```bash
bun run --cwd apps/stdio-example inspect
```

This launches the pinned Inspector integration using the compiled example. Build first. Connect, list tools, select `greet`, and submit:

```json
{ "name": "Ada" }
```

The successful result includes structured data and a text serialization:

```json
{ "message": "Hello, Ada!" }
```

Try an empty name to see validation feedback. The handler should not run for that input.

> **Keep stdout clean.** MCP owns stdout. Send application diagnostics to stderr with `console.error()` rather than `console.log()`.

## Next steps

[Configure a client](clients.md), [run the same tool over HTTP](http.md), or learn about [tool definitions](../tools/definitions.md). The complete runnable teaching example is in [apps/stdio-example](https://github.com/keshavkatwe/toolgrain/tree/main/apps/stdio-example).
