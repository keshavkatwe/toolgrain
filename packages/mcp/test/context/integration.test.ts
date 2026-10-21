import {
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import {
  type ContextProvider,
  createAuthAccessor,
  createContext,
  createServer,
  type ToolContext,
  tool,
} from "../../src/index.js";
import { deferred, MemoryTransport } from "../memory.js";

function message(
  revision: SupportedProtocolVersion,
  method = "tools/call",
  params: Record<string, unknown> = { name: "read", arguments: {} },
) {
  return {
    jsonrpc: "2.0",
    id: 1,
    method,
    params: {
      ...params,
      ...(revision === PROTOCOL_VERSION
        ? {
            _meta: {
              "io.modelcontextprotocol/protocolVersion": revision,
              "io.modelcontextprotocol/clientCapabilities": {},
            },
          }
        : {}),
    },
  };
}

it.each([PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const)(
  "isolates lazy dependencies for concurrent independent %s requests with the same id",
  async (revision) => {
    const gate = deferred();
    const entered = deferred();
    let count = 0;
    const database = createContext({
      name: "db",
      resolve: () => ({ instance: ++count }),
    });
    const services = createContext({
      name: "services",
      async resolve(ctx) {
        const db = await database.use(ctx);
        if (count === 2) entered.resolve();
        await gate.promise;
        return db;
      },
    });
    const registrations = [services, database];
    const server = createServer({
      name: "test",
      version: "1",
      context: registrations,
      tools: {
        read: tool({
          input: z.object({}),
          async execute(_input, ctx) {
            const [a, b] = await Promise.all([
              services.use(ctx),
              services.use(ctx),
            ]);
            expect(a).toBe(b);
            expect(await database.use(ctx)).toBe(a);
            return a;
          },
        }),
      },
    });
    registrations.length = 0;
    const responses = [1, 2].map(() =>
      server.handle(message(revision), { protocolVersion: revision }),
    );
    await entered.promise;
    gate.resolve();
    const results = await Promise.all(responses);
    expect(
      results.map((response) =>
        response && "result" in response
          ? response.result.structuredContent
          : null,
      ),
    ).toEqual([{ instance: 1 }, { instance: 2 }]);
    await server.close();
  },
);

it.each([PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const)(
  "does not run factories for %s discovery, listing, bad input, or unknown tools",
  async (revision) => {
    const resolve = vi.fn(() => 1);
    const database = createContext({ name: "db", resolve });
    const server = createServer({
      name: "test",
      version: "1",
      context: [database],
      tools: {
        read: tool({
          input: z.object({ count: z.number() }),
          execute: (_input, ctx) => database.use(ctx),
        }),
      },
    });
    const requests = [
      message(revision, "tools/list", {}),
      message(revision),
      message(revision, "tools/call", { name: "missing" }),
    ];
    if (revision === PROTOCOL_VERSION)
      requests.push(message(revision, "server/discover", {}));
    for (const request of requests)
      await server.handle(request, { protocolVersion: revision });
    expect(resolve).not.toHaveBeenCalled();
    await server.close();
  },
);

it.each([PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const)(
  "turns missing providers, cycles, and factory failures into %s tool errors",
  async (revision) => {
    const missing = createContext({ name: "missing", resolve: () => 1 });
    let cyclic: ContextProvider<number>;
    cyclic = createContext({
      name: "cyclic",
      resolve: (ctx) => cyclic.use(ctx),
    });
    const failed = createContext({
      name: "failed",
      resolve: () => {
        throw new Error("provider failed");
      },
    });
    const server = createServer({
      name: "test",
      version: "1",
      context: [cyclic, failed],
      tools: {
        missing: tool({
          input: z.object({}),
          execute: (_input, ctx) => missing.use(ctx),
        }),
        cyclic: tool({
          input: z.object({}),
          execute: (_input, ctx) => cyclic.use(ctx),
        }),
        failed: tool({
          input: z.object({}),
          execute: (_input, ctx) => failed.use(ctx),
        }),
      },
    });
    for (const [name, text] of [
      ["missing", 'Context provider "missing" is not registered'],
      ["cyclic", "Context dependency cycle: cyclic -> cyclic"],
      ["failed", "provider failed"],
    ]) {
      expect(
        await server.handle(message(revision, "tools/call", { name }), {
          protocolVersion: revision,
        }),
      ).toMatchObject({
        result: { isError: true, content: [{ type: "text", text }] },
      });
    }
    await server.close();
  },
);

it.each([PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const)(
  "runs lazy providers over %s message transport and preserves negotiated request data",
  async (revision) => {
    const resolve = vi.fn((ctx: ToolContext) => ({
      version: ctx.request.protocolVersion,
      client: ctx.request.client?.info?.name ?? "none",
    }));
    const database = createContext({ name: "db", resolve });
    const transport = new MemoryTransport();
    const server = createServer({
      name: "test",
      version: "1",
      context: [database],
      tools: {
        read: tool({
          input: z.object({}),
          execute: (_input, ctx) => database.use(ctx),
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
          clientInfo: { name: "legacy", version: "1" },
          capabilities: {},
        },
      });
      await vi.waitFor(() => expect(transport.messages).toHaveLength(1));
      transport.receive({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      });
      expect(resolve).not.toHaveBeenCalled();
    }
    const before = transport.messages.length;
    transport.receive(message(revision));
    await vi.waitFor(() => expect(transport.messages).toHaveLength(before + 1));
    expect(transport.messages.at(-1)).toHaveProperty(
      "result.structuredContent",
      {
        version: revision,
        client: revision === LEGACY_PROTOCOL_VERSION ? "legacy" : "none",
      },
    );
    await server.close();
  },
);

it.each(["caller", "server", "transport", "cancel"] as const)(
  "suppresses provider results and aborts its signal on %s cancellation",
  async (mode) => {
    const entered = deferred<ToolContext>();
    const finish = deferred<number>();
    const database = createContext({
      name: "db",
      resolve(ctx) {
        entered.resolve(ctx);
        return finish.promise;
      },
    });
    const server = createServer({
      name: "test",
      version: "1",
      context: [database],
      tools: {
        read: tool({
          input: z.object({}),
          execute: (_input, ctx) => database.use(ctx),
        }),
      },
    });
    const caller = new AbortController();
    const transport = new MemoryTransport();
    let response: Promise<unknown> | undefined;
    if (mode === "transport" || mode === "cancel") {
      await server.listen(transport);
      transport.receive(message(PROTOCOL_VERSION));
    } else
      response = server.handle(message(PROTOCOL_VERSION), {
        signal: caller.signal,
      });
    const ctx = await entered.promise;
    if (mode === "caller") caller.abort(new Error("caller disconnected"));
    else if (mode === "cancel")
      transport.receive({
        jsonrpc: "2.0",
        method: "notifications/cancelled",
        params: { requestId: 1 },
      });
    else if (mode === "transport") transport.callbacks?.onClose();
    else await server.close();
    expect(ctx.signal.aborted).toBe(true);
    finish.resolve(1);
    if (response) expect(await response).toBeUndefined();
    await server.close();
    expect(transport.messages).toEqual([]);
  },
);

it("preserves frozen auth identities through dependency views and keeps auth eager", async () => {
  const type = Symbol.for("context-test/auth");
  const useAuth = createAuthAccessor<{ userId: string }>(type);
  const database = createContext({
    name: "db",
    resolve(ctx) {
      const identity = useAuth(ctx);
      expect(Object.isFrozen(identity)).toBe(true);
      return identity;
    },
  });
  const services = createContext({
    name: "services",
    async resolve(ctx) {
      const identity = await database.use(ctx);
      expect(useAuth(ctx)).toBe(identity);
      return identity.userId;
    },
  });
  const verify = vi.fn(async () => ({ userId: "alice" }));
  const server = createServer({
    name: "test",
    version: "1",
    auth: { type, authorizationServers: ["https://auth.example.com"], verify },
    context: [services, database],
    tools: {
      read: tool({
        input: z.object({}),
        execute: (_input, ctx) => services.use(ctx),
      }),
    },
  });
  await expect(server.handle(message(PROTOCOL_VERSION))).rejects.toMatchObject({
    code: "invalid_token",
  });
  const scope = await server.authorize("token", {
    resource: "https://api.example.com/mcp",
  });
  expect(verify).toHaveBeenCalledOnce();
  expect(
    await server.handle(message(PROTOCOL_VERSION), { auth: scope }),
  ).toHaveProperty("result.content.0.text", "alice");
  scope.dispose();
  await server.close();
});

it("keeps server-specific overrides and caches isolated", async () => {
  const database = createContext({ name: "db", resolve: () => "original" });
  const read = tool({
    input: z.object({}),
    execute: (_input, ctx) => database.use(ctx),
  });
  const original = createServer({
    name: "original",
    version: "1",
    context: [database],
    tools: { read },
  });
  const override = createServer({
    name: "override",
    version: "1",
    context: [database.provide(() => "override")],
    tools: { read },
  });
  const responses = await Promise.all(
    [original, override].map((server) =>
      server.handle(message(PROTOCOL_VERSION)),
    ),
  );
  expect(responses[0]).toHaveProperty("result.content.0.text", "original");
  expect(responses[1]).toHaveProperty("result.content.0.text", "override");
  await Promise.all([original.close(), override.close()]);
});
