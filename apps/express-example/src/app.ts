import type { Server } from "@toolgrain/mcp";
import { createServer, tool } from "@toolgrain/mcp";
import { createNodeHttpHandler } from "@toolgrain/node";
import express, { type Express } from "express";
import { z } from "zod";
export function expressApp(): { app: Express; server: Server } {
  const app = express();
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
  app.use(createNodeHttpHandler(server));
  app.use(express.json());
  return { app, server };
}
