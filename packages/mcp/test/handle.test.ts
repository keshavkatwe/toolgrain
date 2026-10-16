import { tool } from "@toolgrain/core";
import { PROTOCOL_VERSION } from "@toolgrain/protocol";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createServer } from "../src/index.js";
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
