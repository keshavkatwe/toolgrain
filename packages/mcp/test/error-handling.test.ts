import {
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";
import { expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import {
  createServer,
  mcpResult,
  type ServerOptions,
  type ToolContext,
  type ToolErrorDetails,
  type ToolRequest,
  tool,
} from "../src/index.js";
import { MemoryTransport } from "./memory.js";

function call(
  revision: SupportedProtocolVersion,
  name: string,
  args: unknown = {},
  meta = {},
) {
  return {
    jsonrpc: "2.0",
    id: "request-7",
    method: "tools/call",
    params: {
      name,
      arguments: args,
      _meta: {
        ...meta,
        ...(revision === PROTOCOL_VERSION
          ? {
              "io.modelcontextprotocol/protocolVersion": revision,
              "io.modelcontextprotocol/clientCapabilities": {},
              "io.modelcontextprotocol/clientInfo": {
                name: "review-client",
                version: "1",
              },
            }
          : {}),
      },
    },
  };
}

const genericError = {
  isError: true,
  content: [{ type: "text", text: "Tool execution failed" }],
};

it.each([PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const)(
  "keeps the original failure private and reports frozen tool/request details for %s",
  async (revision) => {
    const failure = new Error("private database address", {
      cause: new Error("private connection details"),
    });
    const onError = vi.fn<NonNullable<ServerOptions["onError"]>>();
    let context: ToolContext | undefined;
    const server = createServer({
      name: "test",
      version: "1",
      onError,
      tools: {
        exposed_name: tool({
          input: z.object({ secret: z.string() }),
          async execute(_input, ctx) {
            context = ctx;
            throw failure;
          },
        }),
      },
    });
    const meta = { trace: { id: "trace-7" } };
    const response = await server.handle(
      call(revision, "exposed_name", { secret: "private argument" }, meta),
      { protocolVersion: revision },
    );
    expect(response).toMatchObject({ result: genericError });
    expect(response).not.toHaveProperty("result.structuredContent");
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure, {
      toolName: "exposed_name",
      request: context?.request,
    });
    const details = onError.mock.calls[0]?.[1];
    expect(details?.request).toBe(context?.request);
    expect(details?.request).toMatchObject({
      id: "request-7",
      protocolVersion: revision,
      meta: { trace: { id: "trace-7" } },
    });
    expect(Object.isFrozen(details)).toBe(true);
    expect(Object.isFrozen(details?.request)).toBe(true);
    expect(Object.isFrozen(details?.request.meta.trace)).toBe(true);
    if (revision === PROTOCOL_VERSION) {
      expect(details?.request.client?.info?.name).toBe("review-client");
      expect(Object.isFrozen(details?.request.client?.info)).toBe(true);
    } else expect(details?.request).not.toHaveProperty("client");
    meta.trace.id = "changed";
    expect(details?.request.meta.trace).toEqual({ id: "trace-7" });
    expect(JSON.stringify(details)).not.toContain("private argument");
    expectTypeOf(details).toEqualTypeOf<ToolErrorDetails | undefined>();
    expectTypeOf(details?.request).toEqualTypeOf<ToolRequest | undefined>();
    await server.close();
  },
);

it.each([PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const)(
  "preserves uninspectable thrown values and their tool/request details for %s",
  async (revision) => {
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    const trapped = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error("private prototype trap failure");
        },
      },
    );
    for (const failure of [revoked.proxy, trapped]) {
      const onError = vi.fn<NonNullable<ServerOptions["onError"]>>();
      const server = createServer({
        name: "test",
        version: "1",
        onError,
        tools: {
          fail: tool({
            input: z.object({}),
            execute() {
              throw failure;
            },
          }),
        },
      });
      try {
        const response = await server.handle(call(revision, "fail"), {
          protocolVersion: revision,
        });
        expect(response).toMatchObject({ result: genericError });
        expect(response).not.toHaveProperty("error");
        expect(response).not.toHaveProperty("result.structuredContent");
        expect(onError).toHaveBeenCalledOnce();
        const [original, details] = onError.mock.calls[0] ?? [];
        // Strict identity avoids inspecting the thrown proxy in assertion matchers.
        expect(original === failure).toBe(true);
        expect(details).toMatchObject({
          toolName: "fail",
          request: { id: "request-7", protocolVersion: revision },
        });
        expect(Object.isFrozen(details)).toBe(true);
        expect(Object.isFrozen(details?.request)).toBe(true);
      } finally {
        await server.close();
      }
    }
  },
);

it.each([PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const)(
  "keeps input feedback and valid explicit tool errors public without reporting them for %s",
  async (revision) => {
    const onError = vi.fn();
    const server = createServer({
      name: "test",
      version: "1",
      onError,
      tools: {
        checked: tool({
          input: z.object({
            count: z.number().positive("Use a positive count"),
          }),
          execute: () => "unused",
        }),
        explicit: tool({
          input: z.object({}),
          output: z.object({ reason: z.string() }),
          execute: () =>
            mcpResult({
              isError: true,
              content: [
                { type: "text", text: "You cannot access this project" },
              ],
              _meta: { retryable: false },
            }),
        }),
        structured: tool({
          input: z.object({}),
          output: z.object({ reason: z.string() }),
          execute: () =>
            mcpResult({
              isError: true,
              content: [],
              structuredContent: { reason: "Project archived" },
            }),
        }),
      },
    });
    const handle = (name: string, args = {}) =>
      server.handle(call(revision, name, args), { protocolVersion: revision });
    expect(await handle("checked", { count: -1 })).toHaveProperty(
      "result.content.0.text",
      "count: Use a positive count",
    );
    expect(await handle("explicit")).toMatchObject({
      result: {
        isError: true,
        content: [{ type: "text", text: "You cannot access this project" }],
        _meta: { retryable: false },
      },
    });
    expect(await handle("structured")).toMatchObject({
      result: {
        isError: true,
        structuredContent: { reason: "Project archived" },
        content: [{ type: "text", text: '{"reason":"Project archived"}' }],
      },
    });
    expect(await handle("missing")).toHaveProperty("error.code", -32602);
    expect(onError).not.toHaveBeenCalled();
    await server.close();
  },
);

it("masks validation exceptions, invalid outputs, malformed explicit errors, and non-Error throws", async () => {
  const failure = new Error("private validation detail");
  const nonError = { private: "detail" };
  const onError = vi.fn();
  const server = createServer({
    name: "test",
    version: "1",
    onError,
    tools: {
      inputThrows: tool({
        input: z.object({}).refine(() => {
          throw failure;
        }),
        execute: () => "unused",
      }),
      outputThrows: tool({
        input: z.object({}),
        output: z.string().refine(() => {
          throw failure;
        }),
        execute: () => "value",
      }),
      outputInvalid: tool({
        input: z.object({}),
        output: z.number().positive(),
        execute: () => -1,
      }),
      malformed: tool({
        input: z.object({}),
        execute: () =>
          mcpResult({
            isError: true,
            content: [{ type: "text", text: 42 } as never],
          }),
      }),
      nonError: tool({
        input: z.object({}),
        execute: () => {
          throw nonError;
        },
      }),
      stringError: tool({
        input: z.object({}),
        execute: () => {
          throw "private thrown string";
        },
      }),
    },
  });
  for (const name of [
    "inputThrows",
    "outputThrows",
    "outputInvalid",
    "malformed",
    "nonError",
    "stringError",
  ]) {
    expect(await server.handle(call(PROTOCOL_VERSION, name))).toMatchObject({
      result: genericError,
    });
    expect(onError).toHaveBeenLastCalledWith(expect.anything(), {
      toolName: name,
      request: expect.objectContaining({ id: "request-7" }),
    });
  }
  expect(onError).toHaveBeenCalledTimes(6);
  expect(onError.mock.calls.map(([error]) => error)).toEqual([
    failure,
    failure,
    expect.objectContaining({
      message: "Invalid output for tool: outputInvalid",
      cause: expect.anything(),
    }),
    expect.any(Error),
    nonError,
    "private thrown string",
  ]);
  await server.close();
});

it.each(["throw", "reject", "close"] as const)(
  "keeps diagnostics safe when onError callbacks %s",
  async (mode) => {
    const failure = new Error("private tool failure");
    const onError = vi.fn(() => {
      if (mode === "throw") throw new Error("diagnostics failed");
      if (mode === "reject")
        return Promise.reject(new Error("diagnostics failed"));
      return server.close();
    });
    const server = createServer({
      name: "test",
      version: "1",
      onError,
      tools: {
        fail: tool({
          input: z.object({}),
          execute: () => {
            throw failure;
          },
        }),
      },
    });
    const response = await server.handle(call(PROTOCOL_VERSION, "fail"));
    if (mode === "close") expect(response).toBeUndefined();
    else expect(response).toMatchObject({ result: genericError });
    expect(onError).toHaveBeenCalledOnce();
    await server.close();
  },
);

it.each([PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const)(
  "reports original failures with request details over %s message transports",
  async (revision) => {
    const failure = new Error("private handler failure");
    const onError = vi.fn();
    const transport = new MemoryTransport();
    const server = createServer({
      name: "test",
      version: "1",
      onError,
      tools: {
        fail: tool({
          input: z.object({}),
          execute: () => {
            throw failure;
          },
        }),
      },
    });
    await server.listen(transport);
    if (revision === LEGACY_PROTOCOL_VERSION) {
      transport.receive({
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: {
          protocolVersion: revision,
          clientInfo: { name: "legacy-client", version: "1" },
          capabilities: {},
        },
      });
      await vi.waitFor(() => expect(transport.messages).toHaveLength(1));
      transport.receive({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      });
    }
    const count = transport.messages.length;
    transport.receive(call(revision, "fail"));
    await vi.waitFor(() => expect(transport.messages).toHaveLength(count + 1));
    expect(transport.messages.at(-1)).toMatchObject({ result: genericError });
    expect(onError).toHaveBeenCalledExactlyOnceWith(failure, {
      toolName: "fail",
      request: expect.objectContaining({
        id: "request-7",
        protocolVersion: revision,
        client: expect.objectContaining({
          info: expect.objectContaining({
            name:
              revision === PROTOCOL_VERSION ? "review-client" : "legacy-client",
          }),
        }),
      }),
    });
    await server.close();
  },
);
