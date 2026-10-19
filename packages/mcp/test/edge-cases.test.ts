import { INTERNAL_ERROR, PROTOCOL_VERSION } from "@toolgrain/protocol";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createConnection } from "../src/connection.js";
import { tool } from "../src/index.js";
import { discover } from "../src/modern/handlers.js";
import { createPendingRequests } from "../src/pending-requests.js";
import { createToolAdapter } from "../src/tools/adapter.js";
import { toolContext } from "../src/tools/context.js";
import { toolResult } from "../src/tools/results.js";
import { deferred, MemoryTransport } from "./memory.js";

const request = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools/list",
  params: {
    _meta: {
      "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
      "io.modelcontextprotocol/clientCapabilities": {},
    },
  },
};

it("rejects malformed discovery parameters", () => {
  expect(() => discover(null)).toThrow("Invalid discovery parameters");
});

it("validates array properties and null-prototype JSON objects", () => {
  expect(() => toolResult(Object.assign([1], { extra: 2 }))).toThrow(
    "array property",
  );
  expect(
    toolResult(Object.assign(Object.create(null), { value: true }))
      .structuredContent,
  ).toEqual({ value: true });
});

it("ignores cancellation for unknown or completed requests", () => {
  const pending = createPendingRequests(() => true);
  pending.cancel(123);
  const token = pending.begin(123);
  expect(token?.isActive()).toBe(true);
  token?.finish();
  pending.cancel(123);
  expect(pending.begin(123)?.isActive()).toBe(true);
});

it("does not execute unknown or already inactive tools", async () => {
  const execute = vi.fn(() => "ok");
  const adapter = createToolAdapter({
    known: tool({ input: z.object({}), execute }),
  });
  expect(await adapter.execute("missing", {}, toolContext())).toBeUndefined();
  expect(
    await adapter.execute(
      "known",
      {},
      toolContext({ signal: AbortSignal.abort() }),
    ),
  ).toBeUndefined();
  expect(execute).not.toHaveBeenCalled();
});

it("formats root validation errors and non-Error handler failures", async () => {
  const adapter = createToolAdapter({
    validated: tool({
      input: z.object({}).refine(() => false, "Rejected"),
      execute: () => "unused",
    }),
    failure: tool({
      input: z.object({}),
      execute: () => {
        throw "failure";
      },
    }),
  });
  expect(await adapter.execute("validated", {}, toolContext())).toMatchObject({
    isError: true,
    content: [{ text: "input: Rejected" }],
  });
  expect(await adapter.execute("failure", {}, toolContext())).toMatchObject({
    isError: true,
    content: [{ text: "Tool execution failed" }],
  });
});

it("reports unexpected dispatch failures as internal errors", async () => {
  const failure = new Error("dispatch failed");
  const report = vi.fn();
  const connection = createConnection(async () => {
    throw failure;
  }, report);
  const transport = new MemoryTransport();
  await connection.listen(transport);
  transport.receive(request);
  await vi.waitFor(() => expect(transport.messages).toHaveLength(1));
  expect(transport.messages[0]).toMatchObject({
    id: 1,
    error: { code: INTERNAL_ERROR },
  });
  expect(report).toHaveBeenCalledWith(failure);
  await connection.close();
});

it.each(["onClose", "onError"] as const)(
  "reports cleanup failures after %s",
  async (event) => {
    const failure = new Error("close failed");
    const report = vi.fn();
    const transport = new MemoryTransport();
    transport.close = async () => {
      throw failure;
    };
    const connection = createConnection(async () => undefined, report);
    await connection.listen(transport);
    if (event === "onClose") transport.callbacks?.onClose();
    else transport.callbacks?.onError(new Error("transport failed"));
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith(failure));
  },
);

it("omits discovery instructions when none were supplied", () => {
  expect(discover(request.params)).not.toHaveProperty("instructions");
});

it("suppresses failures from a tool cancelled during execution", async () => {
  const controller = new AbortController();
  const started = deferred();
  const result = deferred<string>();
  const execute = vi.fn(() => {
    started.resolve();
    return result.promise;
  });
  const adapter = createToolAdapter({
    failure: tool({ input: z.object({}), execute }),
  });
  const response = adapter.execute(
    "failure",
    {},
    toolContext({ signal: controller.signal }),
  );
  await started.promise;
  controller.abort();
  result.reject(new Error("handler failed after cancellation"));
  expect(await response).toBeUndefined();
  expect(execute).toHaveBeenCalledOnce();
});
