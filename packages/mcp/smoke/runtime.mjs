import assert from "node:assert/strict";
import { tool } from "@toolgrain/core";
import { createServer, PROTOCOL_VERSION } from "@toolgrain/mcp";
import { z } from "zod";

let callbacks;
let resolve;
const response = new Promise((yes) => {
  resolve = yes;
});
const server = createServer({
  name: "smoke",
  version: "1.0",
  tools: {
    greet: tool({
      input: z.object({ name: z.string() }),
      execute: ({ name }) => ({ message: `Hello, ${name}!` }),
    }),
  },
});
await server.listen({
  async start(value) {
    callbacks = value;
  },
  async send(message) {
    resolve(message);
  },
  async close() {
    callbacks = undefined;
  },
});
callbacks.onMessage({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    _meta: {
      "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
      "io.modelcontextprotocol/clientCapabilities": {},
    },
    name: "greet",
    arguments: { name: "Ada" },
  },
});
const message = await response;
assert.deepEqual(message.result.structuredContent, { message: "Hello, Ada!" });
assert.equal(message.result.resultType, "complete");
await server.close();
