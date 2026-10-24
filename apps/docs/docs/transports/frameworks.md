# Framework recipes

These recipes show the adapter boundary. Each assumes a Toolgrain `server` with registered tools; see the complete [examples](../examples.md) for runnable applications and lifecycle handling. Mount combined handlers at the application root so auth metadata is reachable.

## Express

```ts
import express from "express";
import { createNodeHttpHandler } from "@toolgrain/node";

const app = express();
app.use(createNodeHttpHandler(server));
app.use(express.json()); // Other application routes may parse JSON afterward.
const listener = app.listen(3001, "127.0.0.1");
```

Matched MCP responses keep their protocol/auth status; unrelated paths call Express's `next` before reading the body. Close both the application listener and Toolgrain server on shutdown.

## Hono

```ts
import { Hono } from "hono";
import { createHttpHandler } from "@toolgrain/http";
import { serve } from "@hono/node-server";

const app = new Hono();
const handler = createHttpHandler(server);
app.use("*", (c, next) =>
  handler.matches(c.req.path) ? handler(c.req.raw) : next(),
);
const listener = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 3002 });
```

The application owns Node listener shutdown and `server.close()`.

## Elysia

```ts
import { Elysia } from "elysia";
import { createHttpHandler } from "@toolgrain/http";

const handler = createHttpHandler(server);
new Elysia()
  .onStop(() => server.close())
  .mount(handler)
  .listen({ hostname: "127.0.0.1", port: 3003 });
```

Run supported Bun applications on 1.4.4 or later within 1.x. The repository also has a protected Clerk Elysia example, kept separate from its ordinary credential-free flow.

## Next.js App Router

For an unprotected endpoint, define the server once in a route module and export its Web handler:

```ts title="app/mcp/route.ts"
import { createHttpHandler } from "@toolgrain/http";
import { server } from "../../lib/server.js";

const handler = createHttpHandler(server);
export const POST = handler;
export const GET = handler;
export const DELETE = handler;
export const runtime = "nodejs";
```

Here `lib/server.ts` is your module exporting a composed server. Use explicit metadata factories in a matching well-known route when protecting a filesystem-routed endpoint; exporting `/mcp` alone does not make the public metadata path routable. Apply the same production host settings to both handlers. See [authorization integration](../guides/authorization.md#combined-handlers-for-existing-applications).

The examples independently test plain Node, Express, Hono, Elysia, and Next.js. Fastify and NestJS are not separately verified; do not infer a tested integration from shared Request/Response types.
