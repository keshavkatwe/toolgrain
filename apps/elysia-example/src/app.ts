import { createHttpHandler } from "@toolgrain/http";
import { Elysia } from "elysia";
import { exampleServer } from "./server.js";
export function elysiaApp() {
  const server = exampleServer();
  const handler = createHttpHandler(server);
  const app = new Elysia().onStop(() => server.close()).mount("/mcp", handler);
  return { app, server };
}
