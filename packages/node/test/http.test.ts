import {
  createServer as createHttpServer,
  request as httpRequest,
} from "node:http";
import type { AddressInfo } from "node:net";
import { createServer, tool } from "@toolgrain/mcp";
import { PROTOCOL_VERSION } from "@toolgrain/protocol";
import { expect, it } from "vitest";
import { z } from "zod";
import { createNodeHttpHandler } from "../src/index.js";

const body = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/list",
  params: {
    _meta: {
      "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
      "io.modelcontextprotocol/clientCapabilities": {},
    },
  },
});
const headers = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
  "MCP-Protocol-Version": PROTOCOL_VERSION,
  "Mcp-Method": "tools/list",
};
async function fixture(maxMessageBytes?: number) {
  const server = createServer({
    name: "test",
    version: "1",
    tools: { greet: tool({ input: z.object({}), execute: () => "hello" }) },
  });
  const handler = createNodeHttpHandler(
    server,
    maxMessageBytes ? { maxMessageBytes } : {},
  );
  const http = createHttpServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(0, "127.0.0.1", resolve);
  });
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`;
  return {
    server,
    http,
    url,
    async close() {
      http.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        http.close((e) => (e ? reject(e) : resolve())),
      );
      await server.close();
    },
  };
}
it("serves real HTTP requests and leaves listener ownership to caller", async () => {
  const f = await fixture();
  try {
    expect((await fetch(f.url)).status).toBe(405);
    const results = await Promise.all([
      fetch(f.url, { method: "POST", headers, body }),
      fetch(f.url, { method: "POST", headers, body }),
    ]);
    for (const result of results) {
      expect(result.status).toBe(200);
      expect(await result.json()).toHaveProperty("result.tools");
    }
    await f.server.close();
    expect(f.http.listening).toBe(true);
    expect((await fetch(f.url, { method: "POST", headers, body })).status).toBe(
      503,
    );
  } finally {
    await f.close();
  }
});
it("rejects oversized bodies", async () => {
  const f = await fixture(8);
  try {
    expect((await fetch(f.url, { method: "POST", headers, body })).status).toBe(
      413,
    );
  } finally {
    await f.close();
  }
});
it("recovers after a client disconnects mid-body", async () => {
  const f = await fixture();
  try {
    await new Promise<void>((resolve) => {
      const req = httpRequest(
        f.url,
        {
          method: "POST",
          headers: { ...headers, "Content-Length": body.length },
        },
        () => {},
      );
      req.on("error", () => {});
      req.on("close", resolve);
      f.http.once("request", () => req.destroy());
      req.write("{");
    });
    expect((await fetch(f.url, { method: "POST", headers, body })).status).toBe(
      200,
    );
  } finally {
    await f.close();
  }
});
