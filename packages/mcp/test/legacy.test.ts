import {
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  type ProtocolResponse,
} from "@toolgrain/protocol";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createServer, tool } from "../src/index.js";
import { deferred, MemoryTransport } from "./memory.js";

const legacyOptions = { protocolVersion: LEGACY_PROTOCOL_VERSION } as const;
const request = (method: string, params?: unknown, id = 1) => ({
  jsonrpc: "2.0",
  id,
  method,
  ...(params === undefined ? {} : { params }),
});
const initialize = (protocolVersion = LEGACY_PROTOCOL_VERSION as string) =>
  request("initialize", {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: "client", version: "1" },
  });
const initialized = { jsonrpc: "2.0", method: "notifications/initialized" };
const modern = () =>
  request("tools/list", {
    _meta: {
      "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
      "io.modelcontextprotocol/clientCapabilities": {},
    },
  });
async function response(
  transport: MemoryTransport,
  message: unknown,
): Promise<ProtocolResponse> {
  const index = transport.messages.length;
  transport.receive(message);
  await vi.waitFor(
    () => expect(transport.messages.length).toBeGreaterThan(index),
    { interval: 1 },
  );
  const result = transport.messages[index];
  if (!result) throw new Error("Expected response");
  return result;
}
const makeServer = () =>
  createServer({
    name: "legacy-test",
    version: "1",
    tools: {},
    instructions: "Use tools",
  });

it("lists input-mode schemas and executes parsed inputs through the unchanged tools API", async () => {
  const execute = vi.fn(({ count }: { count: number }) => ({ count }));
  const server = createServer({
    name: "test",
    version: "1",
    tools: {
      count: tool({
        description: "Count",
        input: z.object({ count: z.string().default("2").transform(Number) }),
        execute,
      }),
      empty: tool({ input: z.object({}), execute: () => "empty" }),
    },
  });
  expect(
    await server.handle(request("tools/list"), legacyOptions),
  ).toMatchObject({
    result: {
      tools: [
        {
          name: "count",
          description: "Count",
          inputSchema: {
            type: "object",
            properties: { count: { type: "string" } },
          },
        },
        { name: "empty", inputSchema: { type: "object" } },
      ],
    },
  });
  expect(
    await server.handle(
      request("tools/call", { name: "count" }),
      legacyOptions,
    ),
  ).toMatchObject({
    result: {
      structuredContent: { count: 2 },
      content: [{ type: "text", text: '{"count":2}' }],
    },
  });
  expect(execute).toHaveBeenCalledExactlyOnceWith({ count: 2 });
});

it("negotiates the supported initialization revision independently without persisting HTTP state", async () => {
  const server = makeServer();
  for (const requested of [
    LEGACY_PROTOCOL_VERSION,
    PROTOCOL_VERSION,
    "2025-11-25",
  ]) {
    expect(await server.handle(initialize(requested))).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: LEGACY_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "legacy-test", version: "1" },
        instructions: "Use tools",
      },
    });
  }
  const results = await Promise.all([
    server.handle(request("tools/list"), legacyOptions),
    server.handle(modern()),
    server.handle(request("tools/list"), legacyOptions),
  ]);
  expect(results[0]).toEqual({ jsonrpc: "2.0", id: 1, result: { tools: [] } });
  expect(results[1]).toHaveProperty("result.resultType", "complete");
  expect(results[2]).toEqual(results[0]);
  expect(await server.handle(request("tools/list"))).toHaveProperty(
    "error.code",
    -32602,
  );
});

it("validates initialization, optional instructions, and legacy request parameters", async () => {
  const server = createServer({ name: "test", version: "1", tools: {} });
  expect(await server.handle(initialize())).not.toHaveProperty(
    "result.instructions",
  );
  for (const params of [
    undefined,
    {},
    {
      protocolVersion: 1,
      capabilities: {},
      clientInfo: { name: "c", version: "1" },
    },
    {
      protocolVersion: LEGACY_PROTOCOL_VERSION,
      capabilities: [],
      clientInfo: {},
    },
    {
      protocolVersion: LEGACY_PROTOCOL_VERSION,
      capabilities: { roots: { listChanged: "yes" } },
      clientInfo: { name: "c", version: "1" },
    },
  ]) {
    expect(await server.handle(request("initialize", params))).toHaveProperty(
      "error.code",
      -32602,
    );
  }
  for (const [method, params] of [
    ["tools/list", { cursor: "next" }],
    ["tools/list", { cursor: 4 }],
    ["tools/call", { name: "missing" }],
    ["tools/call", { name: "missing", arguments: [] }],
    ["tools/call", {}],
    ["ping", { _meta: [] }],
  ] as const) {
    expect(
      await server.handle(request(method, params), legacyOptions),
    ).toHaveProperty("error.code", -32602);
  }
  expect(
    await server.handle(
      request("tools/list", { _meta: { custom: true }, cursor: "" }),
      legacyOptions,
    ),
  ).toHaveProperty("result.tools", []);
  expect(await server.handle(request("unknown"), legacyOptions)).toHaveProperty(
    "error.code",
    -32601,
  );
  expect(
    await server.handle(request("server/discover"), legacyOptions),
  ).toHaveProperty("error.code", -32601);
  expect(await server.handle(request("ping"), legacyOptions)).toEqual({
    jsonrpc: "2.0",
    id: 1,
    result: {},
  });
  expect(await server.handle(initialized, legacyOptions)).toBeUndefined();
  expect(await server.handle({}, legacyOptions)).toEqual({
    jsonrpc: "2.0",
    id: null,
    error: { code: -32600, message: "Invalid request" },
  });
  expect(
    await server.handle(
      { jsonrpc: "2.0", id: 10, method: false },
      legacyOptions,
    ),
  ).toHaveProperty("id", 10);
});

it("keeps explicit modern metadata strict and rejects a conflicting supplied revision", async () => {
  const server = makeServer();
  expect(await server.handle(modern(), legacyOptions)).toHaveProperty(
    "error.code",
    -32602,
  );
  expect(
    await server.handle(initialize(), { protocolVersion: PROTOCOL_VERSION }),
  ).toHaveProperty("error.code", -32602);
  const explicitLegacy = request("tools/list", {
    _meta: {
      "io.modelcontextprotocol/protocolVersion": LEGACY_PROTOCOL_VERSION,
      "io.modelcontextprotocol/clientCapabilities": {},
    },
  });
  expect(await server.handle(explicitLegacy, legacyOptions)).toHaveProperty(
    "result.tools",
    [],
  );
  expect(await server.handle(explicitLegacy)).toHaveProperty(
    "error.code",
    -32022,
  );
});

it("returns object structured content and text-only other JSON values in the legacy era", async () => {
  for (const value of [{ count: 1 }, "hello", [1, 2], 7, false, null]) {
    const server = createServer({
      name: "test",
      version: "1",
      tools: {
        value: tool({ input: z.object({}), execute: () => value }),
      },
    });
    const result = await server.handle(
      request("tools/call", { name: "value" }),
      legacyOptions,
    );
    expect(result).not.toHaveProperty("result.resultType");
    expect(result).not.toHaveProperty("result._meta");
    if (value !== null && typeof value === "object" && !Array.isArray(value))
      expect(result).toHaveProperty("result.structuredContent", value);
    else expect(result).not.toHaveProperty("result.structuredContent");
    expect(result).toHaveProperty("result.content", [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value),
      },
    ]);
  }
});

it("preserves validation, execution errors, and asynchronous cancellation for legacy calls", async () => {
  const started = deferred();
  const gate = deferred<string>();
  const server = createServer({
    name: "test",
    version: "1",
    tools: {
      checked: tool({
        input: z.object({ name: z.string() }),
        execute: ({ name }) => name,
      }),
      fails: tool({
        input: z.object({}),
        execute: () => {
          throw new Error("failed");
        },
      }),
      invalid: tool({ input: z.object({}), execute: () => undefined as never }),
      slow: tool({
        input: z.object({}),
        execute: () => {
          started.resolve();
          return gate.promise;
        },
      }),
    },
  });
  expect(
    await server.handle(
      request("tools/call", { name: "checked", arguments: {} }),
      legacyOptions,
    ),
  ).toHaveProperty("result.isError", true);
  expect(
    await server.handle(
      request("tools/call", { name: "fails" }),
      legacyOptions,
    ),
  ).toHaveProperty("result.content", [{ type: "text", text: "failed" }]);
  expect(
    await server.handle(
      request("tools/call", { name: "invalid" }),
      legacyOptions,
    ),
  ).toHaveProperty("result.isError", true);
  const controller = new AbortController();
  const pending = server.handle(request("tools/call", { name: "slow" }), {
    ...legacyOptions,
    signal: controller.signal,
  });
  await started.promise;
  controller.abort();
  gate.resolve("unused");
  expect(await pending).toBeUndefined();
});

it("tracks stdio initialization locally while modern requests can interleave", async () => {
  const first = makeServer();
  const second = makeServer();
  const transport = new MemoryTransport();
  const separate = new MemoryTransport();
  await first.listen(transport);
  await second.listen(separate);
  transport.receive(initialized);
  expect(await response(transport, request("ping"))).toHaveProperty(
    "result",
    {},
  );
  expect(await response(transport, initialize())).toHaveProperty(
    "result.protocolVersion",
    LEGACY_PROTOCOL_VERSION,
  );
  expect(await response(transport, request("tools/list"))).toHaveProperty(
    "error.code",
    -32600,
  );
  expect(await response(transport, modern())).toHaveProperty(
    "result.resultType",
    "complete",
  );
  transport.receive({ ...initialized, params: { _meta: [] } });
  expect(await response(transport, request("tools/list"))).toHaveProperty(
    "error.code",
    -32600,
  );
  transport.receive(initialized);
  expect(await response(transport, request("tools/list"))).toEqual({
    jsonrpc: "2.0",
    id: 1,
    result: { tools: [] },
  });
  expect(await response(transport, initialize())).toHaveProperty(
    "error.code",
    -32600,
  );
  expect(await response(transport, modern())).toHaveProperty(
    "result.resultType",
    "complete",
  );
  expect(await response(separate, request("tools/list"))).toHaveProperty(
    "error.code",
    -32602,
  );
  expect(
    await second.handle(request("tools/list"), legacyOptions),
  ).toHaveProperty("result.tools", []);
  expect(await response(transport, {})).toHaveProperty("id", null);
  const index = transport.messages.length;
  transport.callbacks?.onParseError(new Error("bad JSON"));
  await vi.waitFor(
    () => expect(transport.messages.length).toBeGreaterThan(index),
    { interval: 1 },
  );
  expect(transport.messages[index]).toEqual({
    jsonrpc: "2.0",
    id: null,
    error: { code: -32700, message: "Parse error" },
  });
  await first.close();
  await second.close();
});

it("allows retry after malformed initialization and ignores initialize cancellation", async () => {
  const server = makeServer();
  const transport = new MemoryTransport();
  await server.listen(transport);
  expect(await response(transport, request("initialize", {}))).toHaveProperty(
    "error.code",
    -32602,
  );
  transport.receive(initialize());
  transport.receive({
    jsonrpc: "2.0",
    method: "notifications/cancelled",
    params: { requestId: 1 },
  });
  await vi.waitFor(() => expect(transport.messages).toHaveLength(2), {
    interval: 1,
  });
  expect(transport.messages[1]).toHaveProperty(
    "result.protocolVersion",
    LEGACY_PROTOCOL_VERSION,
  );
  transport.receive(initialized);
  expect(await response(transport, request("tools/list"))).toHaveProperty(
    "result.tools",
    [],
  );
  await server.close();
});

it("accepts matching legacy metadata only after stdio negotiation and readiness", async () => {
  const server = createServer({
    name: "test",
    version: "1",
    tools: {
      greet: tool({ input: z.object({}), execute: () => "hello" }),
    },
  });
  const transport = new MemoryTransport();
  await server.listen(transport);
  const metadata = (version: string) => ({
    "io.modelcontextprotocol/protocolVersion": version,
    "io.modelcontextprotocol/clientCapabilities": {},
  });
  const list = request("tools/list", {
    _meta: metadata(LEGACY_PROTOCOL_VERSION),
  });
  expect(await response(transport, list)).toHaveProperty("error.code", -32022);
  await response(transport, initialize());
  expect(await response(transport, list)).toHaveProperty("error.code", -32600);
  transport.receive(initialized);
  const listed = await response(transport, list);
  expect(listed).toHaveProperty("result.tools.0.name", "greet");
  expect(listed).not.toHaveProperty("result.resultType");
  expect(
    await response(
      transport,
      request("tools/call", {
        name: "greet",
        _meta: metadata(LEGACY_PROTOCOL_VERSION),
      }),
    ),
  ).toEqual({
    jsonrpc: "2.0",
    id: 1,
    result: { content: [{ type: "text", text: "hello" }] },
  });
  expect(
    await response(
      transport,
      request("tools/list", { _meta: metadata("2025-11-25") }),
    ),
  ).toHaveProperty("error.code", -32022);
  expect(await response(transport, modern())).toHaveProperty(
    "result.resultType",
    "complete",
  );
  await server.close();
});
