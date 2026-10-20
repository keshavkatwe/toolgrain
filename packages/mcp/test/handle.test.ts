import {
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createServer, tool } from "../src/index.js";
import { deferred } from "./memory.js";

const meta = {
  "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
  "io.modelcontextprotocol/clientCapabilities": {},
};
const message = (method = "tools/list", params = {}) => ({
  jsonrpc: "2.0",
  id: 1,
  method,
  params: { _meta: meta, ...params },
});
it("handles independent messages and snapshots tool definitions", async () => {
  const server = createServer({ name: "test", version: "1", tools: {} });
  const responses = await Promise.all([
    server.handle(message()),
    server.handle(message()),
  ]);
  expect(responses.every((r) => r && "result" in r)).toBe(true);
  expect(await server.handle({})).toHaveProperty("error");
  expect(
    await server.handle({
      jsonrpc: "2.0",
      method: "notifications/cancelled",
      params: { requestId: 1 },
    }),
  ).toBeUndefined();
  expect(await server.handle(message("unknown"))).toHaveProperty(
    "error.code",
    -32601,
  );
  expect(server.getToolDefinitions()).toEqual([]);
  const controller = new AbortController();
  controller.abort();
  expect(
    await server.handle(message(), { signal: controller.signal }),
  ).toBeUndefined();
  await server.close();
  await expect(server.handle(message())).rejects.toThrow("closed");
});
it.each([
  [PROTOCOL_VERSION, PROTOCOL_VERSION],
  [PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION],
  [LEGACY_PROTOCOL_VERSION, PROTOCOL_VERSION],
  [LEGACY_PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION],
] as const)(
  "keeps existing and future identities isolated (%s → %s)",
  async (source, target) => {
    const expected = { name: "test", version: "1" };
    const server = createServer({ ...expected, tools: {} });
    let id = 0;
    async function identity(protocolVersion: SupportedProtocolVersion) {
      const response = await server.handle(
        protocolVersion === PROTOCOL_VERSION
          ? { ...message("server/discover"), id: ++id }
          : {
              jsonrpc: "2.0",
              id: ++id,
              method: "initialize",
              params: {
                protocolVersion,
                capabilities: {},
                clientInfo: { name: "client", version: "1" },
              },
            },
        { protocolVersion },
      );
      if (!response || !("result" in response))
        throw new Error("Expected successful response");
      const info =
        protocolVersion === PROTOCOL_VERSION
          ? response.result._meta?.["io.modelcontextprotocol/serverInfo"]
          : response.result.serverInfo;
      if (
        typeof info !== "object" ||
        info === null ||
        !("name" in info) ||
        !("version" in info)
      )
        throw new Error("Expected server identity");
      return info;
    }
    try {
      const original = await identity(source);
      const existing = await identity(target);
      original.name = "changed";
      original.version = "999";
      expect(existing).toEqual(expected);
      expect(await identity(target)).toEqual(expected);
    } finally {
      await server.close();
    }
  },
);
it("cancellation and server close suppress pending responses", async () => {
  for (const action of ["abort", "close"]) {
    const gate = deferred();
    const started = deferred();
    const execute = vi.fn(async () => {
      started.resolve();
      await gate.promise;
      return "done";
    });
    const server = createServer({
      name: "test",
      version: "1",
      tools: { slow: tool({ input: z.object({}), execute }) },
    });
    const controller = new AbortController();
    const result = server.handle(
      message("tools/call", { name: "slow", arguments: {} }),
      { signal: controller.signal },
    );
    await started.promise;
    if (action === "abort") controller.abort();
    else await server.close();
    gate.resolve();
    expect(await result).toBeUndefined();
    expect(execute).toHaveBeenCalledOnce();
    await server.close();
  }
});
it("closes independent processing when the attached transport reaches EOF", async () => {
  const { MemoryTransport } = await import("./memory.js");
  const transport = new MemoryTransport();
  const server = createServer({ name: "test", version: "1", tools: {} });
  await server.listen(transport);
  transport.callbacks?.onClose();
  await expect(server.handle(message())).rejects.toThrow("closed");
  await server.close();
});
it("returns fresh tool definitions", () => {
  const server = createServer({
    name: "test",
    version: "1",
    tools: {
      greet: tool({
        input: z.object({ name: z.string() }),
        execute: () => "hi",
      }),
    },
  });
  const definitions = server.getToolDefinitions();
  const first = definitions[0];
  expect(first).toBeDefined();
  if (first) first.name = "changed";
  expect(server.getToolDefinitions()[0]?.name).toBe("greet");
});
