import assert from "node:assert/strict";
import { createHttpHandler } from "@toolgrain/http";
import { createServer } from "@toolgrain/mcp";
import { PROTOCOL_VERSION } from "@toolgrain/protocol";

const server = createServer({ name: "smoke", version: "1", tools: {} });
const handler = createHttpHandler(server);
assert.equal(handler.matches("/mcp"), true);
assert.equal(handler.matches("/health"), false);
assert.equal((await handler(new Request("http://localhost/mcp"))).status, 405);
const response = await handler(
  new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL_VERSION,
      "Mcp-Method": "tools/list",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  }),
);
assert.equal(response.status, 200);
assert.deepEqual((await response.json()).result.tools, []);
await server.close();
