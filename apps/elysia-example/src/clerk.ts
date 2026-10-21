import { clerk, useAuth } from "@toolgrain/clerk";
import { createHttpHandler } from "@toolgrain/http";
import { createServer, tool } from "@toolgrain/mcp";
import { Elysia } from "elysia";
import { z } from "zod";

// Bun loads these keys from this workspace's ignored .env.local file.
const publishableKey = process.env.CLERK_PUBLISHABLE_KEY;
const secretKey = process.env.CLERK_SECRET_KEY;
if (!publishableKey || !secretKey)
  throw new Error(
    "Set CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in apps/elysia-example/.env.local before starting the Clerk example",
  );

const greet = tool({
  title: "Greeting",
  annotations: { readOnlyHint: true, openWorldHint: false },
  description: "Greet someone by name",
  input: z.object({ name: z.string().min(1) }),
  output: z.object({ message: z.string() }),
  execute: ({ name }) => ({ message: `Hello, ${name}!` }),
});

const whoAmI = tool({
  title: "Authenticated caller",
  description: "Show the Clerk OAuth identity verified for this request",
  annotations: { readOnlyHint: true, openWorldHint: false },
  input: z.object({}),
  output: z.object({
    userId: z.string(),
    clientId: z.string(),
    scopes: z.array(z.string()),
  }),
  execute(_input, ctx) {
    const { userId, clientId, scopes } = useAuth(ctx);
    return { userId, clientId, scopes: [...scopes] };
  },
});

// Authorization protects every tool; the resource is inferred from the request URL.
export const server = createServer({
  name: "clerk-elysia",
  version: "1.0.0",
  auth: clerk({
    publishableKey,
    secretKey,
    ...(process.env.MCP_RESOURCE ? { resource: process.env.MCP_RESOURCE } : {}),
  }),
  tools: { greet, whoAmI },
});

// Mount at the root: Toolgrain routes /mcp and public OAuth resource metadata.
export const app = new Elysia()
  .onStop(() => server.close())
  .mount(createHttpHandler(server));

// Start when run directly; tests can import app without opening a network listener.
if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3007);
  app.listen({ hostname: "127.0.0.1", port });
  console.error(
    `Clerk MCP endpoint: http://127.0.0.1:${app.server?.port ?? port}/mcp`,
  );
}
