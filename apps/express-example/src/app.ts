import { tool } from "@toolgrain/core";
import type { Server } from "@toolgrain/mcp";
import { createServer } from "@toolgrain/mcp";
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
        description: "Greet someone by name",
        input: z.object({ name: z.string().min(1) }),
        execute: ({ name }) => ({ message: `Hello, ${name}!` }),
      }),
    },
  });
  app.all("/mcp", createNodeHttpHandler(server));
  app.use(express.json());
  return { app, server };
}
