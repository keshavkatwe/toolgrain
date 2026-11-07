import assert from "node:assert/strict";
import { createHttpHandler } from "@toolgrain/http";
import { AuthError, createServer } from "@toolgrain/mcp";
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

const protectedServer = createServer({
  name: "scope-smoke",
  version: "1",
  tools: {},
  auth: {
    type: Symbol.for("http-smoke/auth"),
    authorizationServers: ["https://auth.example.com"],
    scopesSupported: ["tools:read"],
    async verify() {
      throw new AuthError("insufficient_scope", {
        requiredScopes: ["tools:read"],
      });
    },
  },
});
try {
  const handle = createHttpHandler(protectedServer);
  const metadata = await handle(
    new Request("http://localhost/.well-known/oauth-protected-resource/mcp"),
  );
  assert.deepEqual((await metadata.json()).scopes_supported, ["tools:read"]);
  const denied = await handle(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer limited",
      },
      body: "{",
    }),
  );
  assert.equal(denied.status, 403);
  assert.match(
    denied.headers.get("WWW-Authenticate"),
    /error="insufficient_scope".*scope="tools:read"/,
  );
  assert.deepEqual(await denied.json(), { error: "insufficient_scope" });
} finally {
  await protectedServer.close();
}

// The packed Web handler delivers progress on the originating POST response.
const { tool } = await import("@toolgrain/mcp");
const { z } = await import("zod");
const progressServer = createServer({
  name: "progress",
  version: "1",
  tools: {
    work: tool({
      input: z.object({}),
      async execute(_input, ctx) {
        await ctx.reportProgress({ progress: 1, total: 1 });
        return "done";
      },
    }),
  },
});
try {
  const response = await createHttpHandler(progressServer)(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": PROTOCOL_VERSION,
        "Mcp-Method": "tools/call",
        "Mcp-Name": "work",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "work",
          _meta: {
            "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
            "io.modelcontextprotocol/clientCapabilities": {},
            progressToken: "job",
          },
        },
      }),
    }),
  );
  assert.equal(response.headers.get("Content-Type"), "text/event-stream");
  const events = (await response.text())
    .trim()
    .split("\n\n")
    .map((event) => JSON.parse(event.slice("event: message\ndata: ".length)));
  assert.equal(events[0].method, "notifications/progress");
  assert.equal(events[0].params.progressToken, "job");
  assert.equal(events[1].result.content[0].text, "done");
} finally {
  await progressServer.close();
}
