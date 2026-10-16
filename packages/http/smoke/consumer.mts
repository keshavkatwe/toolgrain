import { createHttpHandler, type HttpOptions } from "@toolgrain/http";
import { createServer } from "@toolgrain/mcp";

const options: HttpOptions = { maxMessageBytes: 1024 };
const handler: (request: Request) => Promise<Response> = createHttpHandler(
  createServer({ name: "types", version: "1", tools: {} }),
  options,
);
void handler;
