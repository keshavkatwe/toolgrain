import {
  AuthError,
  type AuthScope,
  createServer,
  type Server,
  type ToolContext,
  tool,
} from "@toolgrain/mcp";
import {
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createHttpHandler } from "../src/index.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function request(
  revision: SupportedProtocolVersion,
  options: {
    token?: unknown;
    auth?: string;
    signal?: AbortSignal;
    name?: string;
  } = {},
) {
  return new Request("http://localhost/mcp", {
    method: "POST",
    signal: options.signal ?? null,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": revision,
      "Mcp-Method": "tools/call",
      "Mcp-Name": options.name ?? "work",
      ...(options.auth ? { Authorization: `Bearer ${options.auth}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: options.name ?? "work",
        arguments: {},
        _meta: {
          ...(revision === PROTOCOL_VERSION
            ? {
                "io.modelcontextprotocol/protocolVersion": revision,
                "io.modelcontextprotocol/clientCapabilities": {},
              }
            : {}),
          ...(options.token === undefined
            ? {}
            : { progressToken: options.token }),
        },
      },
    }),
  });
}
function events(text: string) {
  return text
    .trim()
    .split("\n\n")
    .map((event) => {
      expect(event.startsWith("event: message\ndata: ")).toBe(true);
      return JSON.parse(event.slice("event: message\ndata: ".length));
    });
}

it.each([PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const)(
  "streams progress before completion and ends with the %s result",
  async (revision) => {
    const release = deferred();
    const server = createServer({
      name: "progress",
      version: "1",
      tools: {
        work: tool({
          input: z.object({}),
          async execute(_input, ctx) {
            await ctx.reportProgress({
              progress: 0.5,
              total: 2,
              message: "世界\nnext",
            });
            await release.promise;
            await ctx.reportProgress({ progress: 2, total: 2 });
            return { done: true };
          },
        }),
      },
    });
    const response = await createHttpHandler(server)(
      request(revision, { token: 0 }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.has("Mcp-Session-Id")).toBe(false);
    if (!response.body) throw new Error("Expected an SSE body");
    const reader = response.body.getReader();
    const first = await reader.read();
    expect(events(new TextDecoder().decode(first.value))).toEqual([
      {
        jsonrpc: "2.0",
        method: "notifications/progress",
        params: {
          progressToken: 0,
          progress: 0.5,
          total: 2,
          message: "世界\nnext",
        },
      },
    ]);
    release.resolve();
    const rest = await new Response(
      new ReadableStream({
        async start(controller) {
          for (;;) {
            const next = await reader.read();
            if (next.done) break;
            controller.enqueue(next.value);
          }
          controller.close();
        },
      }),
    ).text();
    const messages = events(rest);
    expect(messages[0]).toHaveProperty("params.progress", 2);
    expect(messages[1]).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { structuredContent: { done: true } },
    });
    if (revision === PROTOCOL_VERSION)
      expect(messages[1].result.resultType).toBe("complete");
    else expect(messages[1].result).not.toHaveProperty("resultType");
    await server.close();
  },
);

it("preserves JSON responses and HTTP error status until a progress event is sent", async () => {
  const server = createServer({
    name: "progress",
    version: "1",
    tools: {
      work: tool({
        input: z.object({}),
        async execute(_input, ctx) {
          await ctx.reportProgress({ progress: 1 });
          return "done";
        },
      }),
      quiet: tool({ input: z.object({}), execute: () => "quiet" }),
    },
  });
  const handle = createHttpHandler(server);
  for (const options of [
    {},
    { name: "quiet", token: "job" },
    { name: "missing", token: "job" },
    { token: 0.5 },
  ]) {
    const response = await handle(request(PROTOCOL_VERSION, options));
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.status).toBe(
      options.name === "missing" || options.token === 0.5 ? 400 : 200,
    );
    await response.json();
  }
  await server.close();
  expect((await handle(request(PROTOCOL_VERSION))).status).toBe(503);
});

it("keeps unexpected handler failures private after SSE starts", async () => {
  const failure = new Error("private database password");
  const onError = vi.fn();
  const server = createServer({
    name: "progress",
    version: "1",
    onError,
    tools: {
      work: tool({
        input: z.object({}),
        async execute(_input, ctx) {
          await ctx.reportProgress({ progress: 1 });
          throw failure;
        },
      }),
    },
  });
  const response = await createHttpHandler(server)(
    request(PROTOCOL_VERSION, { token: "job" }),
  );
  const text = await response.text();
  expect(events(text).at(-1)).toMatchObject({
    result: {
      isError: true,
      content: [{ type: "text", text: "Tool execution failed" }],
    },
  });
  expect(text).not.toContain("password");
  expect(onError).toHaveBeenCalledExactlyOnceWith(
    failure,
    expect.objectContaining({ toolName: "work" }),
  );
  await server.close();
});

it.each(["body", "signal", "server"] as const)(
  "cancels the SSE request on %s closure even when its handler ignores cancellation",
  async (action) => {
    const gate = deferred();
    const onError = vi.fn();
    let context!: ToolContext;
    const server = createServer({
      name: "progress",
      version: "1",
      onError,
      tools: {
        work: tool({
          input: z.object({}),
          async execute(_input, ctx) {
            context = ctx;
            await ctx.reportProgress({ progress: 1 });
            await gate.promise;
            await ctx.reportProgress({ progress: 2 });
            throw new Error("late private failure");
          },
        }),
      },
    });
    const controller = new AbortController();
    const response = await createHttpHandler(server)(
      request(PROTOCOL_VERSION, { token: "job", signal: controller.signal }),
    );
    if (!response.body) throw new Error("Expected an SSE body");
    const reader = response.body.getReader();
    expect((await reader.read()).done).toBe(false);
    if (action === "body") await reader.cancel();
    else {
      const next = reader.read();
      const rejected = expect(next).rejects.toMatchObject({
        name: "AbortError",
      });
      if (action === "signal") controller.abort();
      else await server.close();
      await rejected;
    }
    await vi.waitFor(() => expect(context.signal.aborted).toBe(true));
    gate.resolve();
    await ctxSettled();
    expect(onError).not.toHaveBeenCalled();
    await server.close();
  },
);
async function ctxSettled() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

it("honors backpressure, aborts a blocked write, and releases authorization scopes", async () => {
  const afterProgress = vi.fn();
  let authorized: AuthScope | undefined;
  const actual = createServer({
    name: "progress",
    version: "1",
    auth: {
      type: Symbol.for("progress/auth"),
      authorizationServers: ["https://auth.example.com"],
      async verify(token) {
        if (token === "invalid") throw new AuthError("invalid_token");
        return { user: token };
      },
    },
    tools: {
      work: tool({
        input: z.object({}),
        async execute(_input, ctx) {
          await ctx.reportProgress({ progress: 1 });
          afterProgress();
          return "done";
        },
      }),
    },
  });
  const server: Server = {
    ...actual,
    async authorize(token, options) {
      const scope = await actual.authorize(token, options);
      authorized = scope;
      return scope;
    },
  };
  const handle = createHttpHandler(server);
  expect(
    (await handle(request(PROTOCOL_VERSION, { token: "job", auth: "invalid" })))
      .status,
  ).toBe(401);
  const response = await handle(
    request(PROTOCOL_VERSION, { token: "job", auth: "valid" }),
  );
  expect(afterProgress).not.toHaveBeenCalled();
  expect(authorized?.signal.aborted).toBe(false);
  // While delivery is blocked, the authorized invocation still belongs to the server.
  await actual.close();
  expect(authorized?.signal.aborted).toBe(true);
  await expect(response.text()).rejects.toMatchObject({ name: "AbortError" });
  expect(afterProgress).not.toHaveBeenCalled();
});

it("disposes authorization when the streamed final result completes", async () => {
  let authorized: AuthScope | undefined;
  const actual = createServer({
    name: "progress",
    version: "1",
    auth: {
      type: Symbol.for("progress/disposal"),
      authorizationServers: ["https://auth.example.com"],
      async verify() {
        return {};
      },
    },
    tools: {
      work: tool({
        input: z.object({}),
        async execute(_input, ctx) {
          await ctx.reportProgress({ progress: 1 });
          return "done";
        },
      }),
    },
  });
  const server: Server = {
    ...actual,
    async authorize(token, options) {
      authorized = await actual.authorize(token, options);
      return authorized;
    },
  };
  const response = await createHttpHandler(server)(
    request(PROTOCOL_VERSION, { token: "job", auth: "valid" }),
  );
  expect(events(await response.text())).toHaveLength(2);
  await actual.close();
  expect(authorized?.signal.aborted).toBe(false);
});

it.each([PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const)(
  "aborts a blocked final SSE write on server shutdown in %s",
  async (revision) => {
    const completed = deferred();
    const onError = vi.fn();
    let context!: ToolContext;
    const actual = createServer({
      name: "progress",
      version: "1",
      onError,
      tools: {
        work: tool({
          input: z.object({}),
          async execute(_input, ctx) {
            context = ctx;
            await ctx.reportProgress({ progress: 1 });
            return "done";
          },
        }),
      },
    });
    const server: Server = {
      ...actual,
      async handle(...args) {
        const result = await actual.handle(...args);
        completed.resolve();
        return result;
      },
    };
    const response = await createHttpHandler(server)(
      request(revision, { token: "job" }),
    );
    if (!response.body) throw new Error("Expected an SSE body");
    const reader = response.body.getReader();
    try {
      expect(
        events(new TextDecoder().decode((await reader.read()).value))[0],
      ).toHaveProperty("method", "notifications/progress");
      // A task boundary lets execution reach the blocked final write without
      // consuming it. The handler itself has already returned its result.
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(context.signal.aborted).toBe(false);
      await actual.close();
      await expect(reader.read()).rejects.toMatchObject({ name: "AbortError" });
      expect(context.signal.aborted).toBe(true);
      await completed.promise;
      expect(onError).not.toHaveBeenCalled();
    } finally {
      await reader.cancel().catch(() => {});
      await actual.close();
    }
  },
);

it("delivers the final result when a structural server forwards only public options", async () => {
  const actual = createServer({
    name: "progress",
    version: "1",
    tools: {
      work: tool({
        input: z.object({}),
        async execute(_input, ctx) {
          await ctx.reportProgress({ progress: 1 });
          return "done";
        },
      }),
    },
  });
  const server: Server = {
    ...actual,
    handle(message, { signal, protocolVersion, auth, onNotification } = {}) {
      return actual.handle(message, {
        ...(signal ? { signal } : {}),
        ...(protocolVersion ? { protocolVersion } : {}),
        ...(auth ? { auth } : {}),
        ...(onNotification ? { onNotification } : {}),
      });
    },
  };
  try {
    const response = await createHttpHandler(server)(
      request(PROTOCOL_VERSION, { token: "job" }),
    );
    const messages = events(await response.text());
    expect(messages).toHaveLength(2);
    expect(messages[1]).toHaveProperty("result.content.0.text", "done");
  } finally {
    await actual.close();
  }
});

it.each([PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const)(
  "isolates simultaneous streams with the same JSON-RPC id and progress token in %s",
  async (revision) => {
    let index = 0;
    const server = createServer({
      name: "progress",
      version: "1",
      tools: {
        work: tool({
          input: z.object({}),
          async execute(_input, ctx) {
            const current = ++index;
            await ctx.reportProgress({ progress: 1, message: String(current) });
            return current;
          },
        }),
      },
    });
    const handle = createHttpHandler(server);
    const responses = await Promise.all([
      handle(request(revision, { token: "same" })),
      handle(request(revision, { token: "same" })),
    ]);
    const streams = await Promise.all(
      responses.map(async (response) => events(await response.text())),
    );
    expect(streams.map((stream) => stream[0].params.message).sort()).toEqual([
      "1",
      "2",
    ]);
    for (const stream of streams)
      expect(stream.at(-1).result.content[0].text).toBe(
        stream[0].params.message,
      );
    await server.close();
  },
);
