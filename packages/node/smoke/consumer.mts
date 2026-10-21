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

const { http } = await import("@toolgrain/node");
const listener: import("@toolgrain/node").HttpTransport = http({
  port: 0,
  path: "/mcp",
  allowedHosts: ["localhost"],
});
const requestTransport: import("@toolgrain/mcp").RequestTransport = listener;
const address: import("node:net").AddressInfo | undefined = listener.address();
void address;
await createServer({
  name: "http-listener-types",
  version: "1",
  tools: {},
}).listen(requestTransport);
await listener.close();
