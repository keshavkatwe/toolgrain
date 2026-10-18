import { createHttpHandler } from "@toolgrain/http";
import { createServer, tool } from "@toolgrain/mcp";
import { Elysia } from "elysia";
import { z } from "zod";
export function elysiaApp() {
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
  const app = new Elysia().onStop(() => server.close()).mount("/mcp", handler);
  return { app, server };
}
