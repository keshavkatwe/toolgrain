import {
  type ClientCapabilities,
  type Implementation,
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  type RequestId,
} from "@toolgrain/protocol";
import type {
  ClientCapabilities as LegacyClientCapabilities,
  Implementation as LegacyImplementation,
} from "@toolgrain/protocol/2025-06-18";
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
  expect(Object.isFrozen(ctx?.request.client?.info)).toBe(true);
  expect(
    Object.isFrozen(ctx?.request.meta["io.modelcontextprotocol/clientInfo"]),
  ).toBe(true);
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

  // Each request gets its own deeply frozen client, so one handler cannot
  // change what later handlers see.
  const first = contexts[0]?.request.client;
  expect(Reflect.set(first?.info ?? {}, "name", "changed")).toBe(false);
  expect(Reflect.set(first?.capabilities ?? {}, "sampling", {})).toBe(false);
  transport.receive(call({}, 2));
  await vi.waitFor(() => expect(transport.messages).toHaveLength(3));
  const second = contexts[1]?.request.client;
  expect(second).not.toBe(first);
  expect(second?.info).not.toBe(first?.info);
  expect(second).toEqual({
    info: clientInfo,
    capabilities: { elicitation: {} },
  });
});

it.each(["modern", "legacy"] as const)(
  "preserves %s client fields and isolates their frozen copies",
  async (era) => {
    const { contexts, tools } = recorder();
    const { server, transport } = await listen(tools);
    const info = {
      ...clientInfo,
      icons: era === "modern" ? [{ src: "client.png" }] : "legacy extension",
    };
    const capabilities = {
      elicitation: { form: era === "modern" ? {} : null },
      sampling: { tools: era === "modern" ? {} : false },
      experimental: { "com.example/test": { values: ["original"] } },
    };
    const params =
      era === "modern"
        ? {
            _meta: {
              ...modernMeta,
              "io.modelcontextprotocol/clientInfo": info,
              "io.modelcontextprotocol/clientCapabilities": capabilities,
            },
          }
        : {};
    if (era === "legacy") {
      transport.receive({
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: {
          protocolVersion: LEGACY_PROTOCOL_VERSION,
          clientInfo: info,
          capabilities,
        },
      });
      await vi.waitFor(() => expect(transport.messages).toHaveLength(1));
      expect(transport.messages[0]).toHaveProperty("result");
      transport.receive({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      });
    }

    const before = transport.messages.length;
    for (const id of [1, 2]) {
      transport.receive(call(params, id));
      await vi.waitFor(() =>
        expect(transport.messages).toHaveLength(before + id),
      );
      expect(transport.messages.at(-1)).toMatchObject({
        result: { content: [{ type: "text", text: "done" }] },
      });
    }

    const first = contexts[0]?.request.client;
    const second = contexts[1]?.request.client;
    expect(first).toEqual({ info, capabilities });
    expect(second).toEqual(first);
    expect(first?.info).not.toBe(info);
    expect(first?.capabilities).not.toBe(capabilities);
    expect(second).not.toBe(first);
    expect(second?.info).not.toBe(first?.info);
    expect(second?.capabilities).not.toBe(first?.capabilities);
    const extension = first?.capabilities?.experimental?.["com.example/test"];
    const values = Reflect.get(extension ?? {}, "values");
    expect(values).not.toBe(
      capabilities.experimental["com.example/test"].values,
    );
    expect(Object.isFrozen(first?.info)).toBe(true);
    expect(Object.isFrozen(first?.capabilities?.elicitation)).toBe(true);
    expect(Object.isFrozen(extension)).toBe(true);
    expect(Object.isFrozen(values)).toBe(true);
    expect(Reflect.set(values, "0", "changed")).toBe(false);
    expect(second).toEqual({ info, capabilities });
    await server.close();
  },
);

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

it("reuses the pending close when an abort listener closes the server", async () => {
  const release = deferred();
  const { contexts, started, tools } = recorder(release.promise);
  const { server, transport } = await listen(tools);
  transport.receive(call());
  await started.promise;
  let nested: Promise<void> | undefined;
  contexts[0]?.signal.addEventListener("abort", () => {
    nested = server.close();
  });
  const outer = server.close();
  expect(nested).toBe(outer);
  await outer;
  expect(transport.closes).toBe(1);
  expect(contexts[0]?.signal.reason).toMatchObject({
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

  const info = { name: "caller", version: "1" };
  const copied = toolContext({ request: { client: { info } } });
  expect(copied.request.client?.info).toEqual(info);
  expect(copied.request.client?.info).not.toBe(info);
  expect(Object.isFrozen(copied.request.client?.info)).toBe(true);
  expect(Object.isFrozen(info)).toBe(false);

  // JavaScript callers can pass undefined despite the types; defaults still apply.
  const loose = toolContext({
    request: { id: undefined, protocolVersion: undefined, meta: undefined },
  } as never);
  expect(loose.request).toEqual({
    id: 0,
    protocolVersion: PROTOCOL_VERSION,
    meta: {},
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

it("rejects mutations of nested client data at compile time", () => {
  tool({
    input: z.object({}),
    execute(_input, ctx) {
      const client = ctx.request.client;
      if (client?.info) {
        expectTypeOf(client.info.name).toEqualTypeOf<string>();
        // @ts-expect-error Client information is frozen at runtime.
        client.info.name = "changed";
        if ("icons" in client.info) {
          // @ts-expect-error Client icon arrays are frozen at runtime.
          client.info.icons?.push({ src: "other.png" });
          const icon = client.info.icons?.[0];
          if (icon) {
            // @ts-expect-error Nested icon objects are frozen at runtime.
            icon.src = "changed.png";
            // @ts-expect-error Nested icon size arrays are frozen at runtime.
            icon.sizes?.push("96x96");
          }
        }
      }
      const capabilities = client?.capabilities;
      if (capabilities?.experimental) {
        // @ts-expect-error Experimental capability records are frozen in both eras.
        capabilities.experimental["com.example/test"] = {};
      }
      if (capabilities && "extensions" in capabilities) {
        const extension = capabilities.extensions?.["com.example/test"];
        if (extension) {
          // @ts-expect-error Capability records are deeply frozen at runtime.
          extension["com.example/enabled"] = true;
        }
      }
      return "ok";
    },
  });
});

it("accepts both client eras and requires guards for fields that differ", () => {
  const legacyInfo: LegacyImplementation = clientInfo;
  const legacyCapabilities: LegacyClientCapabilities = {
    roots: { listChanged: true },
    sampling: { tools: false },
    elicitation: { form: null },
  };
  const modernInfo: Implementation = {
    ...clientInfo,
    icons: [{ src: "client.png", sizes: ["48x48"] }],
  };
  const modernCapabilities: ClientCapabilities = {
    sampling: { tools: {} },
    elicitation: { form: {} },
    extensions: { "com.example/test": {} },
  };
  for (const client of [
    { info: legacyInfo, capabilities: legacyCapabilities },
    { info: modernInfo, capabilities: modernCapabilities },
  ]) {
    const ctx = toolContext({ request: { client } });
    // Existing readonly views remain valid construction inputs.
    toolContext({ request: ctx.request });
  }

  tool({
    input: z.object({}),
    execute(_input, { request }) {
      if (request.client?.info) {
        expectTypeOf(request.client.info.name).toEqualTypeOf<string>();
        expectTypeOf(request.client.info.title).toEqualTypeOf<
          string | undefined
        >();
      }
      // @ts-expect-error Legacy client information does not declare icons.
      request.client?.info?.icons;
      // @ts-expect-error Legacy sampling does not declare a tools field.
      request.client?.capabilities?.sampling?.tools;
      if (request.protocolVersion === PROTOCOL_VERSION) {
        // @ts-expect-error ToolRequest does not correlate the version with client info.
        request.client?.info?.icons;
        // @ts-expect-error ToolRequest does not correlate the version with capabilities.
        request.client?.capabilities?.elicitation?.form;
      }
      return "ok";
    },
  });
});
