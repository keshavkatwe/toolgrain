import { clerkApp } from "./clerk-app.js";

const publishableKey = process.env.CLERK_PUBLISHABLE_KEY;
const secretKey = process.env.CLERK_SECRET_KEY;
if (!publishableKey || !secretKey)
  throw new Error(
    "Set CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in apps/elysia-example/.env.local before starting the Clerk example",
  );

const { app } = clerkApp({
  publishableKey,
  secretKey,
  ...(process.env.MCP_RESOURCE ? { resource: process.env.MCP_RESOURCE } : {}),
});
const port = Number(process.env.PORT ?? 3007);
app.listen({ hostname: "127.0.0.1", port });
console.error(
  `Clerk MCP endpoint: http://127.0.0.1:${app.server?.port ?? port}/mcp`,
);
