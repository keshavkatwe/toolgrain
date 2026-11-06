import { createHttpHandler } from "@toolgrain/http";
import { Elysia } from "elysia";
import { server } from "./server.js";

const mcp = server();
const app = new Elysia()
  .onStop(() => mcp.close())
  .mount(createHttpHandler(mcp))
  .listen(Number(process.env.PORT ?? 3008));
console.error(`React Apps example: ${app.server?.url}`);
