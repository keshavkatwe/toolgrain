import assert from "node:assert/strict";
import { createServer, mcpResult, tool, toolContext } from "@toolgrain/mcp";
import { LEGACY_PROTOCOL_VERSION, PROTOCOL_VERSION } from "@toolgrain/protocol";
import { z } from "zod";
import * as mini from "zod/v4/mini";

let callbacks;
let resolve;
const versions = [];
const response = new Promise((yes) => {
  resolve = yes;
});
const server = createServer({
  name: "smoke",
  version: "1.0",
  tools: {
    greet: tool({
      title: "Greeting",
      annotations: { readOnlyHint: true },
      input: z.object({ name: z.string() }),
      output: z.object({ message: z.string() }),
      execute: ({ name }, ctx) => {
        versions.push(ctx.request.protocolVersion);
        return mcpResult({
          content: [],
          structuredContent: { message: `Hello, ${name}!` },
        });
      },
    }),
    miniGreet: tool({
      input: mini.object({ name: mini._default(mini.string(), "Mini") }),
      output: mini.object({ message: mini.string() }),
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
const legacy = await server.handle(
  {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "greet", arguments: { name: "Legacy" } },
  },
  { protocolVersion: LEGACY_PROTOCOL_VERSION },
);
assert.deepEqual(legacy.result.structuredContent, {
  message: "Hello, Legacy!",
});
assert.equal(legacy.result.resultType, undefined);
assert.deepEqual(legacy.result.content, [
  { type: "text", text: '{"message":"Hello, Legacy!"}' },
]);
assert.deepEqual(versions, [PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION]);
for (const protocolVersion of [PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION]) {
  const result = await server.handle(
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "miniGreet",
        ...(protocolVersion === PROTOCOL_VERSION
          ? {
              _meta: {
                "io.modelcontextprotocol/protocolVersion": protocolVersion,
                "io.modelcontextprotocol/clientCapabilities": {},
              },
            }
          : {}),
      },
    },
    { protocolVersion },
  );
  assert.deepEqual(result.result.structuredContent, {
    message: "Hello, Mini!",
  });
}
const direct = toolContext({ request: { id: "smoke" } });
assert.equal(direct.request.id, "smoke");
assert.equal(direct.signal.aborted, false);
await server.close();

assert.throws(
  () => createServer({ name: "invalid", version: "1", tools: { bad: {} } }),
  (error) => {
    assert.match(error.message, /must be created with tool\(\)/);
    assert.match(error.stack, /[/\\]src[/\\]tools[/\\]registry\.ts:\d+:\d+/);
    return true;
  },
);
