import {
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  type RequestId,
} from "@toolgrain/protocol";
import { expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import {
  createServer,
  type ToolContext,
  tool,
  toolContext,
} from "../src/index.js";
import { deferred, MemoryTransport } from "./memory.js";

const clientInfo = { name: "client", version: "1" };
const modernMeta = {
  "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
  "io.modelcontextprotocol/clientCapabilities": { roots: {} },
  "io.modelcontextprotocol/clientInfo": clientInfo,
  "com.example/trace": "abc",
};
const call = (
  params: Record<string, unknown> = { _meta: modernMeta },
  id: RequestId = 1,
) => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name: "inspect", arguments: {}, ...params },
});
const cancel = (requestId: RequestId) => ({
  jsonrpc: "2.0",
  method: "notifications/cancelled",
  params: { requestId },
});

/** A tool that records its context and optionally waits before returning. */
function recorder(wait?: Promise<void>) {
  const contexts: ToolContext[] = [];
  const started = deferred();
  const inspect = tool({
    input: z.object({}),
    async execute(_input, ctx) {
      contexts.push(ctx);
      started.resolve();
      await wait;
      return "done";
    },
  });
  return { contexts, started, tools: { inspect } };
}

async function listen(tools: ReturnType<typeof recorder>["tools"]) {
  const transport = new MemoryTransport();
  const server = createServer({ name: "test", version: "1", tools });
  await server.listen(transport);
  return { server, transport };
}

it("gives modern handlers the request id, version, client, and a meta copy", async () => {
  const { contexts, tools } = recorder();
  const server = createServer({ name: "test", version: "1", tools });
  expect(await server.handle(call(undefined, "req-7"))).toHaveProperty(
    "result",
  );
  const [ctx] = contexts;
  expect(ctx?.request).toEqual({
    id: "req-7",
    protocolVersion: PROTOCOL_VERSION,
    client: { info: clientInfo, capabilities: { roots: {} } },
    meta: modernMeta,
  });
  expect(ctx?.signal.aborted).toBe(false);
  expect(Object.isFrozen(ctx)).toBe(true);
  expect(Object.isFrozen(ctx?.request)).toBe(true);
  expect(Object.isFrozen(ctx?.request.meta)).toBe(true);
  expect(ctx?.request.meta).not.toBe(modernMeta);
});

it("omits absent client info and uses empty meta for legacy HTTP-style calls", async () => {
  const { contexts, tools } = recorder();
  const server = createServer({ name: "test", version: "1", tools });
  await server.handle(call({}), { protocolVersion: LEGACY_PROTOCOL_VERSION });
  expect(contexts[0]?.request).toEqual({
    id: 1,
    protocolVersion: LEGACY_PROTOCOL_VERSION,
    meta: {},
  });
  expect(contexts[0]?.request).not.toHaveProperty("client");

  const modern = createServer({ name: "test", version: "1", tools });
  const { "io.modelcontextprotocol/clientInfo": _info, ...withoutInfo } =
    modernMeta;
  await modern.handle(call({ _meta: withoutInfo }));
  expect(contexts[1]?.request.client).toEqual({
    capabilities: { roots: {} },
  });
});

it("gives legacy stdio handlers the client from initialization", async () => {
  const { contexts, tools } = recorder();
  const { transport } = await listen(tools);
  transport.receive({
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: LEGACY_PROTOCOL_VERSION,
      capabilities: { elicitation: {} },
      clientInfo,
    },
  });
  await vi.waitFor(() => expect(transport.messages).toHaveLength(1));
  transport.receive({ jsonrpc: "2.0", method: "notifications/initialized" });
  transport.receive(call({ _meta: { "com.example/trace": "abc" } }));
  await vi.waitFor(() => expect(transport.messages).toHaveLength(2));
  expect(contexts[0]?.request).toEqual({
    id: 1,
    protocolVersion: LEGACY_PROTOCOL_VERSION,
    client: { info: clientInfo, capabilities: { elicitation: {} } },
    meta: { "com.example/trace": "abc" },
  });
});

it("aborts the signal when a stdio client cancels the request", async () => {
  const release = deferred();
  const { contexts, started, tools } = recorder(release.promise);
  const { transport } = await listen(tools);
  transport.receive(call());
  await started.promise;
  transport.receive(cancel(1));
  await vi.waitFor(() => expect(contexts[0]?.signal.aborted).toBe(true));
  expect(contexts[0]?.signal.reason).toMatchObject({
    name: "AbortError",
    message: "Request cancelled by client",
  });
  release.resolve();
  await vi.waitFor(() => expect(contexts).toHaveLength(1));
  expect(transport.messages).toEqual([]);
});

it("aborts in-flight signals when the transport closes", async () => {
  const release = deferred();
  const { contexts, started, tools } = recorder(release.promise);
  const { transport } = await listen(tools);
  transport.receive(call());
  await started.promise;
  transport.callbacks?.onClose();
  expect(contexts[0]?.signal.reason).toMatchObject({
    name: "AbortError",
    message: "Connection closed",
  });
  release.resolve();
});

it("forwards the caller's abort reason to independent requests", async () => {
  const release = deferred();
  const { contexts, started, tools } = recorder(release.promise);
  const server = createServer({ name: "test", version: "1", tools });
  const controller = new AbortController();
  const reason = new Error("client disconnected");
  const response = server.handle(call(), { signal: controller.signal });
  await started.promise;
  controller.abort(reason);
  expect(contexts[0]?.signal.reason).toBe(reason);
  release.resolve();
  expect(await response).toBeUndefined();
});

it("aborts independent requests when the server closes", async () => {
  const release = deferred();
  const { contexts, started, tools } = recorder(release.promise);
  const server = createServer({ name: "test", version: "1", tools });
  const response = server.handle(call());
  await started.promise;
  await server.close();
  expect(contexts[0]?.signal.reason).toMatchObject({
    name: "AbortError",
    message: "Server closed",
  });
  release.resolve();
  expect(await response).toBeUndefined();
});

it("builds direct-call contexts with defaults and overrides", () => {
  const ctx = toolContext();
  expect(ctx.signal.aborted).toBe(false);
  expect(ctx.request).toEqual({
    id: 0,
    protocolVersion: PROTOCOL_VERSION,
    meta: {},
  });
  expect(Object.isFrozen(ctx.request)).toBe(true);

  const signal = AbortSignal.abort();
  const custom = toolContext({
    signal,
    request: { id: "test", client: { info: clientInfo }, meta: { a: 1 } },
  });
  expect(custom.signal).toBe(signal);
  expect(custom.request).toEqual({
    id: "test",
    protocolVersion: PROTOCOL_VERSION,
    client: { info: clientInfo },
    meta: { a: 1 },
  });

  const greet = tool({
    input: z.object({ name: z.string() }),
    execute: ({ name }, { request }) => `${name}:${request.id}`,
  });
  expect(greet.execute({ name: "Ada" }, toolContext())).toBe("Ada:0");
});

it("types the handler context and keeps input-only handlers valid", () => {
  tool({
    input: z.object({}),
    execute(_input, ctx) {
      expectTypeOf(ctx).toEqualTypeOf<ToolContext>();
      expectTypeOf(ctx.signal).toEqualTypeOf<AbortSignal>();
      expectTypeOf(ctx.request.protocolVersion).toEqualTypeOf<
        "2026-07-28" | "2025-06-18"
      >();
      return "ok";
    },
  });
  const inputOnly = tool({ input: z.object({}), execute: () => "ok" });
  // @ts-expect-error Direct calls must supply a context.
  inputOnly.execute({});
});
