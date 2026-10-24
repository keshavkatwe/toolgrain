# @toolgrain/http

Streamable HTTP handlers for Toolgrain MCP servers using Web `Request` and
`Response`. Applications own the HTTP listener and framework integration.

## Installation

Toolgrain packages are unpublished. This command describes consumer
dependencies for a future release; use the
[framework examples](https://github.com/keshavkatwe/toolgrain/tree/main/apps#readme)
to try Toolgrain today.

```sh
npm install @toolgrain/http @toolgrain/mcp zod
```

## Mount a Web handler

```ts
import { createHttpHandler } from "@toolgrain/http";
import { createServer, tool } from "@toolgrain/mcp";
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

// Connect this function to your framework's Request -> Promise<Response> API.
export const handleRequest = createHttpHandler(server, { path: "/mcp" });
```

Mount the combined handler at the application root, before body parsing. The
default MCP path is `/mcp`. With `createServer({ auth })`, it also serves public
GET/HEAD protected-resource metadata. `handleRequest.matches(pathname)` identifies
the routes it owns so a framework can delegate other paths. Standalone unmatched
paths return 404. See the
[Hono](https://github.com/keshavkatwe/toolgrain/tree/main/apps/hono-example#readme)
and [Next.js](https://github.com/keshavkatwe/toolgrain/tree/main/apps/nextjs-example#readme)
examples for listener and router setup.

## HTTP behavior

Both MCP `2026-07-28` and `2025-06-18` use independent POST requests with JSON
responses. There are no persistent sessions, SSE streams, or resumability. MCP
GET and DELETE return 405; auth metadata uses its separate public route.

Options include `path`, `allowedHosts`, `allowedOrigins`, and `maxMessageBytes`
(default 1 MiB). Loopback hosts on any port are allowed by default; configure
exact production authorities explicitly. A present Origin must match
`allowedOrigins`, which defaults to an empty list. Applications own CORS, TLS,
trusted proxy normalization, and listener shutdown. Host checks happen before
authorization and body reads. Request cancellation reaches `ctx.signal`;
handlers must observe it to stop work early.

For an owned Node listener, use `http()` from
[@toolgrain/node](https://github.com/keshavkatwe/toolgrain/tree/main/packages/node#readme).
See the
[authorization guide](https://github.com/keshavkatwe/toolgrain/blob/main/docs/authorization.md)
for JWT/Clerk configuration and public URL handling.

## Requirements

ESM only. Node.js `^24.20.0` or Bun `>=1.4.4 <2`; Zod `^4.6.6` through MCP;
TypeScript 5.5.4 or later with `strict` enabled. See the
[support policy](https://github.com/keshavkatwe/toolgrain/blob/main/docs/support-policy.md).

## License

MIT License, copyright 2026 Keshav Katwe. See the
[license text](https://github.com/keshavkatwe/toolgrain/blob/main/packages/http/LICENSE).
Third-party dependencies retain their own licenses.
