import { createHttpHandler } from "@toolgrain/http";
import { Hono } from "hono";
import { exampleServer } from "./server.js";
export function honoApp() {
  const app = new Hono();
  const server = exampleServer();
  const handler = createHttpHandler(server);
  app.all("/mcp", (c) => handler(c.req.raw));
  return { app, server };
}
