import { type ToolMap, tool } from "@toolgrain/core";
import type { JSONRPCResponse, RequestId, Result } from "@toolgrain/protocol";
import { PROTOCOL_VERSION } from "@toolgrain/protocol";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createServer, ToolSchemaError } from "../src/index.js";
import { deferred, MemoryTransport } from "./memory.js";

const meta = {
  "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
  "io.modelcontextprotocol/clientCapabilities": {},
};
function request(
  method: string,
  params: Record<string, unknown> = {},
  id: RequestId = 1,
) {
  return { jsonrpc: "2.0", id, method, params: { _meta: meta, ...params } };
}
async function setup(tools: ToolMap = {}) {
  const transport = new MemoryTransport();
  const server = createServer({
    name: "test",
    version: "1.0",
    instructions: "Use tools",
    tools,
  });
  await server.listen(transport);
  return { server, transport };
}
async function response(
  transport: MemoryTransport,
  message: unknown,
): Promise<JSONRPCResponse> {
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
function result(message: JSONRPCResponse): Result {
  if (!("result" in message)) throw new Error(JSON.stringify(message));
  return message.result;
}
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

it("discovers the modern protocol, static tools, identity, and cache hints", async () => {
  const { transport } = await setup();
  expect(result(await response(transport, request("server/discover")))).toEqual(
    {
      resultType: "complete",
      supportedVersions: [PROTOCOL_VERSION],
      capabilities: { tools: {} },
      ttlMs: 0,
      cacheScope: "private",
      instructions: "Use tools",
      _meta: {
        "io.modelcontextprotocol/serverInfo": { name: "test", version: "1.0" },
      },
    },
  );
});

it("lists converted input schemas and executes without discovery", async () => {
  const execute = vi.fn((input: { count: number }) => ({ count: input.count }));
  const { transport } = await setup({
    count: tool({
      description: "Count",
      input: z.object({ count: z.string().default("2").transform(Number) }),
      execute,
    }),
  });
  const list = result(await response(transport, request("tools/list")));
  expect(list).toMatchObject({
    tools: [
      {
        name: "count",
        description: "Count",
        inputSchema: {
          type: "object",
          properties: { count: { type: "string" } },
        },
      },
    ],
    ttlMs: 0,
    cacheScope: "private",
  });
  expect(list).not.toHaveProperty("nextCursor");
  expect(
    result(await response(transport, request("tools/call", { name: "count" }))),
  ).toMatchObject({
    resultType: "complete",
    structuredContent: { count: 2 },
    content: [{ type: "text", text: '{"count":2}' }],
  });
  expect(execute).toHaveBeenCalledExactlyOnceWith({ count: 2 });
});

it("snapshots registrations and handles inherited-property names", async () => {
  const definition = tool({ input: z.object({}), execute: () => "original" });
  const tools = { constructor: definition, ["__proto__"]: definition };
  const { transport } = await setup(tools);
  tools.constructor = tool({ input: z.object({}), execute: () => "changed" });
  expect(
    result(
      await response(transport, request("tools/call", { name: "constructor" })),
    ),
  ).toMatchObject({ content: [{ text: "original" }] });
  expect(
    result(
      await response(transport, request("tools/call", { name: "__proto__" })),
    ),
  ).toMatchObject({ content: [{ text: "original" }] });
});

it("lists an empty registry and rejects nonempty cursors", async () => {
  const { transport } = await setup();
  expect(
    result(await response(transport, request("tools/list", { cursor: "" }))),
  ).toMatchObject({ tools: [] });
  expect(
    await response(transport, request("tools/list", { cursor: "next" })),
  ).toMatchObject({ error: { code: -32602 } });
});

it.each([
  [{ jsonrpc: "1.0", id: 1, method: "tools/list" }, -32600],
  [{ jsonrpc: "2.0", id: null, method: "tools/list" }, -32600],
  [[], -32600],
  [request("tools/call", { name: 12 }), -32602],
  [request("tools/call", { name: "missing", arguments: [] }), -32602],
  [request("tools/call", { name: "missing" }), -32602],
  [request("tools/list", { cursor: 1 }), -32602],
  [request("unknown"), -32601],
  [request("initialize"), -32601],
  [request("tools/list", { _meta: {} }), -32602],
  [
    request("tools/list", {
      _meta: { ...meta, "io.modelcontextprotocol/clientCapabilities": [] },
    }),
    -32602,
  ],
  [
    request("tools/list", {
      _meta: {
        ...meta,
        "io.modelcontextprotocol/clientInfo": { name: "client" },
      },
    }),
    -32602,
  ],
])("rejects invalid protocol input %#", async (message, code) => {
  const { transport } = await setup();
  expect(await response(transport, message)).toMatchObject({ error: { code } });
});

it("rejects older versions and never inherits prior request metadata", async () => {
  const { transport } = await setup();
  expect(
    await response(
      transport,
      request("tools/list", {
        _meta: {
          ...meta,
          "io.modelcontextprotocol/protocolVersion": "2025-11-25",
        },
      }),
    ),
  ).toMatchObject({
    error: {
      code: -32022,
      data: { supported: [PROTOCOL_VERSION], requested: "2025-11-25" },
    },
  });
  await response(transport, request("server/discover"));
  expect(
    await response(transport, { jsonrpc: "2.0", id: 1, method: "tools/list" }),
  ).toMatchObject({ error: { code: -32602 } });
});

it("accepts and preserves unknown metadata and capability extensions", async () => {
  const { transport } = await setup();
  expect(
    result(
      await response(
        transport,
        request("tools/list", {
          _meta: {
            ...meta,
            "com.example/custom": { value: 1 },
            "io.modelcontextprotocol/clientCapabilities": {
              custom: { value: 2 },
              extensions: { "com.example/custom": {} },
            },
          },
        }),
      ),
    ),
  ).toMatchObject({ tools: [] });
});

it("ignores notifications and reports adapter parse failures without an ID", async () => {
  const { transport } = await setup();
  transport.receive({ jsonrpc: "2.0", method: "tools/call", params: {} });
  transport.receive({ jsonrpc: "1.0", method: "ignored" });
  await settle();
  expect(transport.messages).toEqual([]);
  transport.callbacks?.onParseError(new SyntaxError("bad JSON"));
  await vi.waitFor(
    () =>
      expect(transport.messages).toEqual([
        { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" } },
      ]),
    { interval: 1 },
  );
});

it("turns validation and handler failures into tool errors without stacks", async () => {
  const execute = vi.fn(() => "ok");
  const { transport } = await setup({
    checked: tool({
      input: z.object({ count: z.number().positive() }),
      execute,
    }),
    fails: tool({
      input: z.object({}),
      execute: () => {
        throw new Error("Service unavailable");
      },
    }),
    rejects: tool({
      input: z.object({}),
      execute: async () => {
        throw "non-error failure";
      },
    }),
  });
  expect(
    result(
      await response(
        transport,
        request("tools/call", { name: "checked", arguments: { count: -1 } }),
      ),
    ),
  ).toMatchObject({
    isError: true,
    content: [{ type: "text", text: expect.stringContaining("count:") }],
  });
  expect(execute).not.toHaveBeenCalled();
  expect(
    result(await response(transport, request("tools/call", { name: "fails" }))),
  ).toMatchObject({
    isError: true,
    content: [{ text: "Service unavailable" }],
  });
  expect(
    result(
      await response(transport, request("tools/call", { name: "rejects" })),
    ),
  ).toMatchObject({
    isError: true,
    content: [{ text: "Tool execution failed" }],
  });
});

it("fails construction for non-object or unrepresentable schemas", () => {
  for (const input of [z.string(), z.object({ date: z.date() })]) {
    expect(() =>
      createServer({
        name: "test",
        version: "1",
        tools: { bad: tool({ input, execute: () => null }) },
      }),
    ).toThrow(ToolSchemaError);
  }
});

describe("transport lifecycle", () => {
  it("allows independent concurrent requests and rejects duplicate active IDs", async () => {
    const pending = deferred<string>();
    const { transport } = await setup({
      slow: tool({ input: z.object({}), execute: () => pending.promise }),
    });
    transport.receive(request("tools/call", { name: "slow" }, 1));
    await response(transport, request("tools/list", {}, 2));
    expect(transport.messages[0]).toMatchObject({ id: 2 });
    expect(
      await response(transport, request("tools/list", {}, 1)),
    ).toMatchObject({ id: 1, error: { code: -32600 } });
    pending.resolve("done");
    await vi.waitFor(() => expect(transport.messages).toHaveLength(3), {
      interval: 1,
    });
    expect(transport.messages[2]).toMatchObject({
      id: 1,
      result: { content: [{ text: "done" }] },
    });
  });

  it("allows execution after cancellation during validation but suppresses its response", async () => {
    const gate = deferred<boolean>();
    const validating = deferred();
    const execute = vi.fn(() => "done");
    const { transport } = await setup({
      slow: tool({
        input: z.object({}).refine(() => {
          validating.resolve();
          return gate.promise;
        }),
        execute,
      }),
    });
    transport.receive(request("tools/call", { name: "slow" }));
    await validating.promise;
    transport.receive({
      jsonrpc: "2.0",
      method: "notifications/cancelled",
      params: { requestId: 1 },
    });
    gate.resolve(true);
    await settle();
    expect(execute).toHaveBeenCalledExactlyOnceWith({});
    expect(transport.messages).toEqual([]);
  });

  it("discards already-running handler results on cancellation", async () => {
    const pending = deferred<string>();
    const execute = vi.fn(() => pending.promise);
    const { transport } = await setup({
      slow: tool({ input: z.object({}), execute }),
    });
    transport.receive(request("tools/call", { name: "slow" }));
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce(), {
      interval: 1,
    });
    transport.receive({
      jsonrpc: "2.0",
      method: "notifications/cancelled",
      params: { requestId: 1 },
    });
    pending.resolve("unused");
    await settle();
    expect(transport.messages).toEqual([]);
    await response(transport, request("tools/list", {}, 2));
  });

  it("closes once, ignores late callbacks, and rejects reuse", async () => {
    const { transport, server } = await setup();
    const callbacks = transport.callbacks;
    await Promise.all([server.close(), server.close()]);
    expect(transport.closes).toBe(1);
    callbacks?.onMessage(request("tools/list"));
    callbacks?.onParseError(new Error("late"));
    await settle();
    expect(transport.messages).toEqual([]);
    await expect(server.listen(new MemoryTransport())).rejects.toThrow(
      "cannot restart",
    );
  });

  it("suppresses pending handler responses when closed", async () => {
    const pending = deferred<string>();
    const execute = vi.fn(() => pending.promise);
    const { transport, server } = await setup({
      slow: tool({ input: z.object({}), execute }),
    });
    transport.receive(request("tools/call", { name: "slow" }));
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce(), {
      interval: 1,
    });
    await server.close();
    pending.resolve("unused");
    await settle();
    expect(transport.messages).toEqual([]);
  });

  it("rejects startup failure and cleans up", async () => {
    const transport = new MemoryTransport();
    const error = new Error("startup");
    transport.start = vi.fn(async () => {
      throw error;
    });
    const onError = vi.fn();
    const server = createServer({
      name: "test",
      version: "1",
      tools: {},
      onError,
    });
    await expect(server.listen(transport)).rejects.toBe(error);
    expect(transport.closes).toBe(1);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it("cleans up write failures even when diagnostics throw", async () => {
    const transport = new MemoryTransport();
    transport.send = vi.fn(async () => {
      throw new Error("write");
    });
    const server = createServer({
      name: "test",
      version: "1",
      tools: {},
      onError() {
        throw new Error("diagnostics");
      },
    });
    await server.listen(transport);
    transport.receive(request("tools/list"));
    await vi.waitFor(() => expect(transport.closes).toBe(1), { interval: 1 });
    expect(transport.callbacks).toBeUndefined();
  });

  it("handles remote close and errors", async () => {
    for (const event of ["onClose", "onError"] as const) {
      const { transport } = await setup();
      if (event === "onClose") transport.callbacks?.onClose();
      else transport.callbacks?.onError(new Error("remote error"));
      await vi.waitFor(() => expect(transport.closes).toBe(1), { interval: 1 });
    }
  });

  it("handles close while startup is pending", async () => {
    const gate = deferred();
    const transport = new MemoryTransport();
    transport.start = async () => gate.promise;
    const server = createServer({ name: "test", version: "1", tools: {} });
    const started = server.listen(transport);
    await expect(server.listen(new MemoryTransport())).rejects.toThrow(
      "one transport",
    );
    await server.close();
    gate.resolve();
    await expect(started).rejects.toThrow("closed during startup");
    expect(transport.closes).toBe(1);
  });
});

it("reports unsupported handler outputs as tool errors", async () => {
  const { transport } = await setup({
    invalid: tool({
      input: z.object({}),
      execute: () => ({ missing: undefined }),
    }),
  });
  const reply = result(
    await response(transport, request("tools/call", { name: "invalid" })),
  );
  expect(reply).toMatchObject({
    resultType: "complete",
    isError: true,
    content: [{ type: "text", text: "Tool output must be a JSON value" }],
  });
  expect(reply).not.toHaveProperty("structuredContent");
});

it("propagates explicit close failures and keeps the server terminal", async () => {
  const transport = new MemoryTransport();
  const failure = new Error("close failed");
  transport.close = vi.fn(async () => {
    throw failure;
  });
  const server = createServer({ name: "test", version: "1", tools: {} });
  await server.listen(transport);
  await expect(server.close()).rejects.toBe(failure);
  await expect(server.close()).rejects.toBe(failure);
  expect(transport.close).toHaveBeenCalledOnce();
  await expect(server.listen(new MemoryTransport())).rejects.toThrow(
    "cannot restart",
  );
});

it("suppresses a cancelled response queued behind a pending write", async () => {
  const transport = new MemoryTransport();
  const gate = deferred();
  let first = true;
  transport.send = async (message) => {
    if (first) {
      first = false;
      await gate.promise;
    }
    transport.messages.push(message);
  };
  const server = createServer({ name: "test", version: "1", tools: {} });
  await server.listen(transport);
  transport.receive(request("tools/list", {}, 1));
  await settle();
  transport.receive(request("tools/list", {}, 2));
  transport.receive({
    jsonrpc: "2.0",
    method: "notifications/cancelled",
    params: { requestId: 2 },
  });
  gate.resolve();
  await vi.waitFor(() => expect(transport.messages).toHaveLength(1), {
    interval: 1,
  });
  await settle();
  expect(transport.messages[0]).toMatchObject({ id: 1 });
  expect(transport.messages).toHaveLength(1);
  await server.close();
});

it("preserves detached server methods", async () => {
  const { listen, close } = createServer({
    name: "test",
    version: "1.0",
    tools: {},
  });
  const transport = new MemoryTransport();
  await listen(transport);
  expect(await response(transport, request("tools/list"))).toMatchObject({
    id: 1,
    result: { tools: [] },
  });
  await Promise.all([close(), close()]);
  expect(transport.closes).toBe(1);
});
