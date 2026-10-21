import {
  createHttpHandler,
  type HttpHandler,
  type HttpOptions,
} from "@toolgrain/http";
import { createServer } from "@toolgrain/mcp";

const options: HttpOptions = {
  maxMessageBytes: 1024,
  path: "/mcp",
  allowedHosts: ["localhost"],
};
const handler: HttpHandler = createHttpHandler(
  createServer({ name: "types", version: "1", tools: {} }),
  options,
);
void handler;
const matches: boolean = handler.matches("/mcp");
void matches;
