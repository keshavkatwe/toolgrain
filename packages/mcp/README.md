# @toolgrain/mcp

Define reusable, typed MCP tools and servers with Zod validation. Toolgrain
implements MCP directly, independently of `@modelcontextprotocol/sdk`.

## Installation

Install the same `0.1.0` version across Toolgrain libraries.

```sh
npm install @toolgrain/mcp@0.1.0 @toolgrain/node@0.1.0 zod
npm install --save-dev typescript @types/node
```

`@toolgrain/node` supplies the transport in this example. Zod is a required peer
dependency; version 4 Classic and Mini schemas are supported.

## A typed tool over stdio

```ts
import { createServer, tool } from "@toolgrain/mcp";
import { stdio } from "@toolgrain/node";
import { z } from "zod";

const greet = tool({
  title: "Greeting",
  description: "Greet someone by name",
  annotations: { readOnlyHint: true },
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

Save the example as `server.mts`, compile it using TypeScript with
`--strict --module NodeNext --target ES2022`, then run `node server.mjs`.
Stdio uses stdin and stdout for MCP; write application logs to stderr. EOF
closes the connection. An MCP client starts the program and sends requests.

Registration keys define exposed tool names. Definitions created with `tool()`
are frozen and reusable across servers. Input types are inferred, and input and
declared output schemas are parsed asynchronously, including defaults and
transforms. Ordinary strings and JSON become MCP results. Use `mcpResult()` for
rich content, explicit public errors, and result metadata.

Handlers can accept `execute(input, ctx)` to use request information and
`ctx.signal` for cooperative cancellation. Use `toolContext()` for direct handler
calls, which bypass server validation and result conversion. Unexpected server
execution failures return generic errors and reach the optional `onError`
callback. Request-cached dependencies use `createContext()` and inferred
accessors; see the
[context guide](https://github.com/keshavkatwe/toolgrain/blob/main/docs/context.md).

## Transports and compatibility

Use `stdio()` or `http()` from
[@toolgrain/node](https://github.com/keshavkatwe/toolgrain/tree/main/packages/node#readme),
or mount a Web handler from
[@toolgrain/http](https://github.com/keshavkatwe/toolgrain/tree/main/packages/http#readme).
Both MCP `2026-07-28` and initialization-based `2025-06-18` are supported through
the same tool API. Current HTTP support uses independent POST requests and JSON
responses. See the
[client compatibility notes](https://github.com/keshavkatwe/toolgrain/blob/main/docs/compatibility.md)
for tested clients and limitations.

## Requirements

ESM only. Node.js `^24.20.0` or Bun `>=1.4.4 <2`; Zod `^4.6.6`; TypeScript 5.5.4
or later with `strict` enabled. Node stack traces can use the included source
maps with `node --enable-source-maps server.mjs`. See the
[support policy](https://github.com/keshavkatwe/toolgrain/blob/main/docs/support-policy.md)
and [full API guide](https://github.com/keshavkatwe/toolgrain#readme).

## License

MIT License, copyright 2026 Keshav Katwe. See the
[license text](https://github.com/keshavkatwe/toolgrain/blob/main/packages/mcp/LICENSE).
Third-party dependencies retain their own licenses.
