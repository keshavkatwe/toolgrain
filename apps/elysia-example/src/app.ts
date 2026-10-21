import { createHttpHandler } from "@toolgrain/http";
import { createServer } from "@toolgrain/mcp";
import { Elysia } from "elysia";
import { greet } from "./greet.js";

export function elysiaApp() {
  const server = createServer({
    name: "hello-http",
    version: "1.0.0",
    tools: { greet },
  });
  const handler = createHttpHandler(server);
  const app = new Elysia().onStop(() => server.close()).mount(handler);
  return { app, server };
}
