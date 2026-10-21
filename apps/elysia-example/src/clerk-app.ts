import { type ClerkOptions, clerk } from "@toolgrain/clerk";
import { createHttpHandler } from "@toolgrain/http";
import { createServer } from "@toolgrain/mcp";
import { Elysia } from "elysia";
import { greet } from "./greet.js";
import { whoAmI } from "./who-am-i.js";

export function clerkApp(options: ClerkOptions) {
  const server = createServer({
    name: "clerk-elysia",
    version: "1.0.0",
    auth: clerk(options),
    tools: { greet, whoAmI },
  });
  const app = new Elysia()
    .onStop(() => server.close())
    .mount(createHttpHandler(server));
  return { app, server };
}
