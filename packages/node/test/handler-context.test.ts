import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { PassThrough } from "node:stream";
import { createServer, type ToolContext, tool } from "@toolgrain/mcp";
import { PROTOCOL_VERSION } from "@toolgrain/protocol";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createNodeHttpHandler, stdio } from "../src/index.js";

const call = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "wait",
    arguments: {},
    _meta: {
      "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
      "io.modelcontextprotocol/clientCapabilities": {},
    },
  },
});

/** A tool that runs until its signal aborts, recording the context it saw. */
function waitingServer() {
  const contexts: ToolContext[] = [];
  const server = createServer({
    name: "test",
    version: "1",
    tools: {
      wait: tool({
        input: z.object({}),
        execute: (_input, ctx) => {
          contexts.push(ctx);
          return new Promise<string>((resolve) => {
            ctx.signal.addEventListener("abort", () => resolve("aborted"));
          });
        },
      }),
    },
  });
  return { server, contexts };
}

it("aborts the handler signal when an HTTP client disconnects", async () => {
  const { server, contexts } = waitingServer();
  const handler = createNodeHttpHandler(server);
  const http = createHttpServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`;
  try {
    const client = new AbortController();
    const response = fetch(url, {
      method: "POST",
      signal: client.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": PROTOCOL_VERSION,
        "Mcp-Method": "tools/call",
        "Mcp-Name": "wait",
      },
      body: call,
    });
    await vi.waitFor(() => expect(contexts).toHaveLength(1));
    expect(contexts[0]?.signal.aborted).toBe(false);
    client.abort();
    await expect(response).rejects.toThrow();
    await vi.waitFor(() => expect(contexts[0]?.signal.aborted).toBe(true));
    expect(contexts[0]?.signal.reason).toMatchObject({ name: "AbortError" });
  } finally {
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
    await server.close();
  }
});

it("aborts the handler signal when stdio input reaches EOF", async () => {
  const { server, contexts } = waitingServer();
  const input = new PassThrough();
  const output = new PassThrough();
  const written: string[] = [];
  output.on("data", (chunk) => written.push(String(chunk)));
  await server.listen(stdio({ input, output }));
  input.write(`${call}\n`);
  await vi.waitFor(() => expect(contexts).toHaveLength(1));
  expect(contexts[0]?.signal.aborted).toBe(false);
  input.end();
  await vi.waitFor(() => expect(contexts[0]?.signal.aborted).toBe(true));
  expect(contexts[0]?.signal.reason).toMatchObject({
    name: "AbortError",
    message: "Connection closed",
  });
  expect(written).toEqual([]);
});
