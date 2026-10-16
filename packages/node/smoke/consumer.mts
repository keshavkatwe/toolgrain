import { PassThrough } from "node:stream";
import type { Transport } from "@toolgrain/mcp";
import { type StdioOptions, stdio } from "@toolgrain/node";

const options: StdioOptions = {
  input: new PassThrough(),
  output: new PassThrough(),
  maxMessageBytes: 4096,
};
const transport: Transport = stdio(options);
await transport.close();

const { createNodeHttpHandler } = await import("@toolgrain/node");
const { createServer } = await import("@toolgrain/mcp");
const handler: (
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
) => Promise<void> = createNodeHttpHandler(
  createServer({ name: "http-types", version: "1", tools: {} }),
);
void handler;
