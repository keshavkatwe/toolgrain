import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tool } from "@toolgrain/core";
import { createServer } from "@toolgrain/mcp";
import { LEGACY_PROTOCOL_VERSION, PROTOCOL_VERSION } from "@toolgrain/protocol";
import { expect, it } from "vitest";
import { z } from "zod";
import { createNodeHttpHandler } from "../src/index.js";

it("serves a legacy lifecycle and modern calls through the same real Node HTTP endpoint", async () => {
  let executions = 0;
  const server = createServer({
    name: "dual-http",
    version: "1",
    tools: {
      greet: tool({
        input: z.object({ name: z.string().min(1) }),
        execute: ({ name }) => {
          executions++;
          return { message: `Hello, ${name}!` };
        },
      }),
    },
  });
  const handler = createNodeHttpHandler(server);
  const http = createHttpServer((request, response) => {
    void handler(request, response);
  });
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(0, "127.0.0.1", resolve);
  });
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`;
  const post = (message: unknown, headers: Record<string, string> = {}) =>
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify(message),
    });
  const legacyHeaders = { "MCP-Protocol-Version": LEGACY_PROTOCOL_VERSION };
  try {
    const init = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: LEGACY_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "test", version: "1" },
      },
    });
    expect(init.status).toBe(200);
    expect(init.headers.has("Mcp-Session-Id")).toBe(false);
    expect(await init.json()).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: LEGACY_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "dual-http", version: "1" },
      },
    });
    const ready = await post(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      legacyHeaders,
    );
    expect(ready.status).toBe(202);
    expect(await ready.text()).toBe("");
    const calls = await Promise.all([
      post(
        {
          jsonrpc: "2.0",
          id: 7,
          method: "tools/call",
          params: { name: "greet", arguments: { name: "Legacy" } },
        },
        legacyHeaders,
      ),
      post(
        {
          jsonrpc: "2.0",
          id: 7,
          method: "tools/call",
          params: {
            name: "greet",
            arguments: { name: "Modern" },
            _meta: {
              "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
              "io.modelcontextprotocol/clientCapabilities": {},
            },
          },
        },
        {
          "MCP-Protocol-Version": PROTOCOL_VERSION,
          "Mcp-Method": "tools/call",
          "Mcp-Name": "greet",
        },
      ),
    ]);
    for (const [index, response] of calls.entries()) {
      expect(response.status).toBe(200);
      const message = await response.json();
      expect(message.id).toBe(7);
      expect(message.result.structuredContent.message).toBe(
        `Hello, ${index === 0 ? "Legacy" : "Modern"}!`,
      );
      if (index === 0) expect(message.result).not.toHaveProperty("resultType");
      else expect(message.result.resultType).toBe("complete");
    }
    expect(executions).toBe(2);
    const invalid = await post(
      {
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: { name: "greet", arguments: { name: "" } },
      },
      legacyHeaders,
    );
    expect(invalid.status).toBe(200);
    expect(await invalid.json()).toMatchObject({
      id: 8,
      result: { isError: true },
    });
    expect(executions).toBe(2);
    const missing = await post(
      {
        jsonrpc: "2.0",
        id: 9,
        method: "tools/call",
        params: { name: "missing" },
      },
      legacyHeaders,
    );
    expect(missing.status).toBe(200);
    expect(await missing.json()).toMatchObject({
      id: 9,
      error: { code: -32602 },
    });
    const ping = await post(
      { jsonrpc: "2.0", id: 10, method: "ping" },
      legacyHeaders,
    );
    expect(await ping.json()).toEqual({ jsonrpc: "2.0", id: 10, result: {} });
    expect((await fetch(url)).status).toBe(405);
    expect((await fetch(url, { method: "DELETE" })).status).toBe(405);
  } finally {
    http.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      http.close((error) => (error ? reject(error) : resolve())),
    );
    await server.close();
  }
});
