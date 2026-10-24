# @toolgrain/node

Node.js stdio and HTTP transports for Toolgrain MCP servers. Tools and server
composition live in
[@toolgrain/mcp](https://github.com/keshavkatwe/toolgrain/tree/main/packages/mcp#readme).

## Installation

Release candidate for Toolgrain `0.1.0`; use the explicit `next` tag.
A stable Toolgrain release is not yet available.

```sh
npm install @toolgrain/node@next @toolgrain/mcp@next zod
npm install --save-dev typescript @types/node
```

Node-facing declarations use Node types, so TypeScript applications need
`@types/node` in their development dependencies.

## Own an HTTP listener

```ts
import { createServer, tool } from "@toolgrain/mcp";
import { http } from "@toolgrain/node";
import { z } from "zod";

const server = createServer({
  name: "hello-http",
  version: "1.0.0",
  tools: {
    greet: tool({
      input: z.object({ name: z.string().min(1) }),
      execute: ({ name }) => `Hello, ${name}!`,
    }),
  },
});

const transport = http({ port: 3000 });
await server.listen(transport);
console.error(`MCP port: ${transport.address()?.port}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void server.close();
  });
}
```

Save as `server.mts`, compile with TypeScript using
`--strict --module NodeNext --target ES2022`, and run `node server.mjs`.
The endpoint defaults to `http://127.0.0.1:3000/mcp`. `server.close()` closes the
owned listener. Toolgrain installs no process signal handlers; the example adds
its own shutdown handling.

## Stdio and existing listeners

To use the same unprotected tool definitions over stdio, import `stdio` from
`@toolgrain/node` and attach `stdio()` to a fresh server instead of `http()`.
`stdio({ input?, output?, maxMessageBytes? })` defaults to process stdin/stdout
and a 1 MiB incoming-message limit. EOF closes the transport. Application logs
must go to stderr. Closing detaches listeners and pauses input without ending
supplied streams or exiting the process. See the complete
[stdio example](https://github.com/keshavkatwe/toolgrain/tree/main/apps/stdio-example).

Use `createNodeHttpHandler(server, options?)` with an existing Node HTTP listener
or Express. Mount the combined handler at the root before body parsing; it owns
MCP and optional auth-metadata routing, while your application owns shutdown.
See the [Express example](https://github.com/keshavkatwe/toolgrain/tree/main/apps/express-example#readme).

Both HTTP entry points support `path`, `allowedHosts`, `allowedOrigins`, and
`maxMessageBytes`. `http()` additionally accepts `port` and `hostname`; use port
0 for an available port and `address()` to read a copied bound address. It
restricts default loopback hosts to the actual port; externally mounted handlers
default to loopback on any port. Set production hosts explicitly. Applications
own CORS, TLS, and trusted proxy normalization. Forwarded headers are ignored.

Auth-configured servers require HTTP. See the
[authorization guide](https://github.com/keshavkatwe/toolgrain/blob/main/docs/authorization.md).

## Requirements and protocol support

ESM only. Node.js `^24.20.0` or Bun `>=1.4.4 <2`; Zod `^4.6.6` through MCP;
TypeScript 5.5.4 or later with `strict` enabled. Both MCP `2026-07-28` and
`2025-06-18` are supported over stdio and independent HTTP POSTs with JSON
responses. See the
[support policy](https://github.com/keshavkatwe/toolgrain/blob/main/docs/support-policy.md)
and [client compatibility notes](https://github.com/keshavkatwe/toolgrain/blob/main/docs/compatibility.md).

## License

MIT License, copyright 2026 Keshav Katwe. See the
[license text](https://github.com/keshavkatwe/toolgrain/blob/main/packages/node/LICENSE).
Third-party dependencies retain their own licenses.
