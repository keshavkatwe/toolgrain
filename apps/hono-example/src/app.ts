import { createHttpHandler } from "@toolgrain/http";
import { createServer, tool } from "@toolgrain/mcp";
import { Hono } from "hono";
import { z } from "zod";
export function honoApp() {
  const app = new Hono();
  const server = createServer({
    name: "hello-http",
    version: "1.0.0",
    tools: {
      greet: tool({
        title: "Greeting",
        annotations: { readOnlyHint: true, openWorldHint: false },
        description: "Greet someone by name",
        input: z.object({ name: z.string().min(1) }),
        output: z.object({ message: z.string() }),
        execute: ({ name }) => ({ message: `Hello, ${name}!` }),
      }),
    },
  });
  const handler = createHttpHandler(server);
  app.all("/mcp", (c) => handler(c.req.raw));
  return { app, server };
}
