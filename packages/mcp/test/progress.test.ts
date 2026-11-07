import {
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  type ProgressNotification,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";
import { expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import {
  createContext,
  createServer,
  type ToolContext,
  type ToolProgress,
  tool,
  toolContext,
} from "../src/index.js";
import { createProgressReporter } from "../src/tools/progress.js";
import { deferred, MemoryTransport } from "./memory.js";

const revisions = [PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const;
function call(
  revision: SupportedProtocolVersion,
  token: unknown = "job",
  id = 1,
) {
  return {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: {
      name: "work",
      arguments: {},
      _meta: {
        ...(revision === PROTOCOL_VERSION
          ? {
              "io.modelcontextprotocol/protocolVersion": revision,
              "io.modelcontextprotocol/clientCapabilities": {},
            }
          : {}),
        ...(token === undefined ? {} : { progressToken: token }),
      },
    },
  };
}

async function initialize(
  transport: MemoryTransport,
  revision: SupportedProtocolVersion,
) {
  if (revision !== LEGACY_PROTOCOL_VERSION) return;
  transport.receive({
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: revision,
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    },
  });
  await vi.waitFor(() => expect(transport.messages).toHaveLength(1));
  transport.receive({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  });
  transport.messages.length = 0;
}

it("paces progress at 100 ms intervals and drains every accepted update before completion", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  const sent: { progress: number; time: number }[] = [];
  const reporter = createProgressReporter(
    new AbortController().signal,
    0,
    (message) => {
      sent.push({ progress: message.params.progress, time: performance.now() });
    },
  );
  try {
    await reporter.report({ progress: 0 });
    const second = reporter.report({ progress: 0.5 });
    const third = reporter.report({ progress: 1 });
    let complete = false;
    const finished = reporter.finish().then(() => {
      complete = true;
    });
    await reporter.report({ progress: 2 });
    await vi.advanceTimersByTimeAsync(99);
    expect(sent).toEqual([{ progress: 0, time: 0 }]);
    expect(complete).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual([
      { progress: 0, time: 0 },
      { progress: 0.5, time: 100 },
    ]);
    expect(complete).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    await Promise.all([second, third, finished]);
    expect(sent).toEqual([
      { progress: 0, time: 0 },
      { progress: 0.5, time: 100 },
      { progress: 1, time: 200 },
    ]);
    expect(complete).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    reporter.close();
    vi.useRealTimers();
  }
});

it("lets delivery backpressure satisfy the progress interval", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  const blocked = deferred();
  const sent: number[] = [];
  const reporter = createProgressReporter(
    new AbortController().signal,
    "job",
    async () => {
      sent.push(performance.now());
      if (sent.length === 1) await blocked.promise;
    },
  );
  try {
    const first = reporter.report({ progress: 1 });
    const second = reporter.report({ progress: 2 });
    await vi.advanceTimersByTimeAsync(150);
    expect(sent).toEqual([0]);
    blocked.resolve();
    await Promise.all([first, second, reporter.finish()]);
    expect(sent).toEqual([0, 150]);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    blocked.resolve();
    reporter.close();
    vi.useRealTimers();
  }
});

it.each(["cancel", "close"] as const)(
  "releases a pacing timer and suppresses queued reports on %s",
  async (action) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const controller = new AbortController();
    const send = vi.fn();
    const reporter = createProgressReporter(controller.signal, "job", send);
    try {
      await reporter.report({ progress: 1 });
      const pending = reporter.report({ progress: 2 });
      const rejected = expect(pending).rejects.toMatchObject({
        name: "AbortError",
      });
      const queued = reporter.report({ progress: 3 });
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(1);
      if (action === "cancel") controller.abort();
      else reporter.close();
      await rejected;
      await queued;
      await reporter.finish();
      await reporter.report({ progress: 4 });
      expect(vi.getTimerCount()).toBe(0);
      expect(send).toHaveBeenCalledOnce();
    } finally {
      reporter.close();
      vi.useRealTimers();
    }
  },
);

it.each(revisions)(
  "rejects duplicate active tokens and permits reuse after completion in %s",
  async (revision) => {
    const gate = deferred();
    const transport = new MemoryTransport();
    const execute = vi.fn(async (_input, ctx: ToolContext) => {
      await ctx.reportProgress({ progress: 1 });
      await gate.promise;
      return "done";
    });
    const server = createServer({
      name: "tokens",
      version: "1",
      tools: { work: tool({ input: z.object({}), execute }) },
    });
    await server.listen(transport);
    try {
      await initialize(transport, revision);
      transport.receive(call(revision, 0, 1));
      await vi.waitFor(() => expect(transport.notifications).toHaveLength(1));
      transport.receive(call(revision, 0, 2));
      await vi.waitFor(() => expect(transport.messages).toHaveLength(1));
      expect(transport.messages[0]).toMatchObject({
        id: 2,
        error: { code: -32602, message: "Progress token is already in use" },
      });
      expect(execute).toHaveBeenCalledOnce();
      // String and integer tokens with the same spelling are distinct.
      transport.receive(call(revision, "0", 3));
      await vi.waitFor(() => expect(transport.notifications).toHaveLength(2));
      transport.receive(call(revision, "0", 4));
      await vi.waitFor(() => expect(transport.messages).toHaveLength(2));
      expect(transport.messages[1]).toHaveProperty("error.code", -32602);
      gate.resolve();
      await vi.waitFor(() => expect(transport.messages).toHaveLength(4));
      transport.receive(call(revision, 0, 5));
      await vi.waitFor(() => expect(transport.messages).toHaveLength(5));
      expect(transport.messages[4]).toHaveProperty("result");
      expect(execute).toHaveBeenCalledTimes(3);
    } finally {
      gate.resolve();
      await server.close();
    }
  },
);

it("releases a cancelled token without letting the old handler release a newer claim", async () => {
  const first = deferred();
  const second = deferred();
  const transport = new MemoryTransport();
  const execute = vi.fn(async (_input, ctx: ToolContext) => {
    await ctx.reportProgress({ progress: 1 });
    await (ctx.request.id === 1 ? first : second).promise;
    await ctx.reportProgress({ progress: 2 });
    return "done";
  });
  const server = createServer({
    name: "tokens",
    version: "1",
    tools: { work: tool({ input: z.object({}), execute }) },
  });
  await server.listen(transport);
  try {
    transport.receive(call(PROTOCOL_VERSION, "job", 1));
    await vi.waitFor(() => expect(transport.notifications).toHaveLength(1));
    transport.receive({
      jsonrpc: "2.0",
      method: "notifications/cancelled",
      params: { requestId: 1 },
    });
    transport.receive(call(PROTOCOL_VERSION, "job", 2));
    await vi.waitFor(() => expect(transport.notifications).toHaveLength(2));
    first.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    transport.receive(call(PROTOCOL_VERSION, "job", 3));
    await vi.waitFor(() => expect(transport.messages).toHaveLength(1));
    expect(transport.messages[0]).toHaveProperty("error.code", -32602);
    expect(execute).toHaveBeenCalledTimes(2);
    second.resolve();
    await vi.waitFor(() => expect(transport.messages).toHaveLength(2));
    expect(transport.messages[1]).toHaveProperty("id", 2);
    expect(
      transport.notifications.map((value) => value.params.progress),
    ).toEqual([1, 1, 2]);
  } finally {
    first.resolve();
    second.resolve();
    await server.close();
  }
});

it.each(revisions)(
  "releases tokens when request validation fails in %s",
  async (revision) => {
    const transport = new MemoryTransport();
    const execute = vi.fn(() => "done");
    const server = createServer({
      name: "tokens",
      version: "1",
      tools: { work: tool({ input: z.object({}), execute }) },
    });
    await server.listen(transport);
    try {
      await initialize(transport, revision);
      const invalid = call(revision);
      transport.receive({
        ...invalid,
        params: { ...invalid.params, name: 42 },
      });
      await vi.waitFor(() => expect(transport.messages).toHaveLength(1));
      expect(transport.messages[0]).toHaveProperty("error.code", -32602);
      transport.receive(call(revision, "job", 2));
      await vi.waitFor(() => expect(transport.messages).toHaveLength(2));
      expect(transport.messages[1]).toHaveProperty("result");
      expect(execute).toHaveBeenCalledOnce();
    } finally {
      await server.close();
    }
  },
);

it.each(revisions)(
  "reports ordered fractional progress through a detached method and provider in %s",
  async (revision) => {
    const updates: ProgressNotification[] = [];
    const provider = createContext({
      name: "progress",
      async resolve(ctx) {
        await ctx.reportProgress({ progress: 0, message: "Starting" });
        return { report: ctx.reportProgress };
      },
    });
    let context: ToolContext | undefined;
    const server = createServer({
      name: "progress",
      version: "1",
      context: [provider],
      tools: {
        work: tool({
          input: z.object({}),
          async execute(_input, ctx) {
            context = ctx;
            const { report } = await provider.use(ctx);
            const update = {
              progress: 0.5,
              total: 2.5,
              message: "Processing 世界\nnext",
            };
            const sent = report(update);
            update.progress = 100;
            await sent;
            return { done: true };
          },
        }),
      },
    });
    const response = await server.handle(call(revision, 0), {
      protocolVersion: revision,
      onNotification: (value) => {
        updates.push(value);
      },
    });
    expect(updates).toEqual([
      {
        jsonrpc: "2.0",
        method: "notifications/progress",
        params: { progressToken: 0, progress: 0, message: "Starting" },
      },
      {
        jsonrpc: "2.0",
        method: "notifications/progress",
        params: {
          progressToken: 0,
          progress: 0.5,
          total: 2.5,
          message: "Processing 世界\nnext",
        },
      },
    ]);
    expect(response).toHaveProperty("result.structuredContent", { done: true });
    await context?.reportProgress({ progress: 1 });
    expect(updates).toHaveLength(2);
    await server.close();
  },
);

it("makes direct contexts and callers without a delivery channel or token no-ops", async () => {
  const direct = toolContext();
  const report = direct.reportProgress;
  expectTypeOf(report).toEqualTypeOf<(update: ToolProgress) => Promise<void>>();
  await report({ progress: Number.NaN });
  const onNotification = vi.fn();
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
    },
  });
  const withoutToken = call(PROTOCOL_VERSION);
  delete withoutToken.params._meta.progressToken;
  expect(await server.handle(withoutToken, { onNotification })).toHaveProperty(
    "result",
  );
  expect(await server.handle(call(PROTOCOL_VERSION))).toHaveProperty("result");
  expect(onNotification).not.toHaveBeenCalled();
  await server.close();
});

it.each(revisions)(
  "rejects malformed progress tokens before invoking handlers in %s",
  async (revision) => {
    const execute = vi.fn(() => "done");
    const server = createServer({
      name: "progress",
      version: "1",
      tools: { work: tool({ input: z.object({}), execute }) },
    });
    for (const token of [
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      null,
      {},
      true,
    ]) {
      expect(
        await server.handle(call(revision, token), {
          protocolVersion: revision,
        }),
      ).toHaveProperty("error.code", -32602);
    }
    expect(execute).not.toHaveBeenCalled();
    await server.close();
  },
);

it.each([
  { progress: Number.NaN },
  { progress: Number.POSITIVE_INFINITY },
  { progress: 2, total: Number.NEGATIVE_INFINITY },
  { progress: 2, message: 4 },
  { progress: 1 },
  { progress: 0 },
])("keeps invalid progress private: %j", async (bad) => {
  const onError = vi.fn();
  const onNotification = vi.fn();
  const server = createServer({
    name: "progress",
    version: "1",
    onError,
    tools: {
      work: tool({
        input: z.object({}),
        async execute(_input, ctx) {
          await ctx.reportProgress({ progress: 1 });
          await ctx.reportProgress(bad as ToolProgress);
          return "unreachable";
        },
      }),
    },
  });
  const response = await server.handle(call(PROTOCOL_VERSION), {
    onNotification,
  });
  expect(response).toMatchObject({
    result: {
      isError: true,
      content: [{ type: "text", text: "Tool execution failed" }],
    },
  });
  expect(response).not.toHaveProperty("result.structuredContent");
  expect(onNotification).toHaveBeenCalledOnce();
  expect(onError).toHaveBeenCalledExactlyOnceWith(expect.any(TypeError), {
    toolName: "work",
    request: expect.objectContaining({ id: 1 }),
  });
  await server.close();
});

it("honors delivery backpressure and flushes accepted updates before the final response", async () => {
  const first = deferred();
  const started = deferred();
  const order: number[] = [];
  const server = createServer({
    name: "progress",
    version: "1",
    tools: {
      work: tool({
        input: z.object({}),
        execute(_input, ctx) {
          void ctx.reportProgress({ progress: 1 });
          void ctx.reportProgress({ progress: 2 });
          return "done";
        },
      }),
    },
  });
  let complete = false;
  const response = server
    .handle(call(PROTOCOL_VERSION), {
      async onNotification(message) {
        order.push(message.params.progress);
        if (message.params.progress === 1) {
          started.resolve();
          await first.promise;
        }
      },
    })
    .then((value) => {
      complete = true;
      return value;
    });
  await started.promise;
  expect(order).toEqual([1]);
  expect(complete).toBe(false);
  first.resolve();
  expect(await response).toHaveProperty("result");
  expect(order).toEqual([1, 2]);
  await server.close();
});

it("cancels blocked progress promptly and suppresses late writes and failures", async () => {
  const started = deferred();
  const blocked = deferred();
  const controller = new AbortController();
  const onError = vi.fn();
  let context: ToolContext | undefined;
  const onNotification = vi.fn(async () => {
    started.resolve();
    await blocked.promise;
  });
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
          return "late";
        },
      }),
    },
  });
  const response = server.handle(call(PROTOCOL_VERSION), {
    signal: controller.signal,
    onNotification,
  });
  await started.promise;
  controller.abort();
  expect(await response).toBeUndefined();
  await context?.reportProgress({ progress: 2 });
  blocked.reject(new Error("late private delivery failure"));
  await Promise.resolve();
  expect(onNotification).toHaveBeenCalledOnce();
  expect(onError).not.toHaveBeenCalled();
  await server.close();
});

it("reports a delivery failure and closes reporters on dispatch failure", async () => {
  const failure = new Error("private delivery failure");
  const reporter = createProgressReporter(
    new AbortController().signal,
    "job",
    () => {
      throw failure;
    },
  );
  await expect(reporter.report({ progress: 1 })).rejects.toBe(failure);
  await reporter.finish();
  await reporter.report({ progress: 2 });
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
          return "done";
        },
      }),
    },
  });
  expect(
    await server.handle(call(PROTOCOL_VERSION), {
      onNotification() {
        throw failure;
      },
    }),
  ).toBeUndefined();
  expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
  await server.close();
});

it("skips delivery when cancellation wins before the queued callback starts", async () => {
  const controller = new AbortController();
  const send = vi.fn();
  const reporter = createProgressReporter(controller.signal, "job", send);
  const pending = reporter.report({ progress: 1 });
  queueMicrotask(() => controller.abort());
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await reporter.finish();
  expect(send).not.toHaveBeenCalled();
});

it.each(["complete", "failure", "shutdown"] as const)(
  "keeps internal response delivery active through %s",
  async (action) => {
    const started = deferred();
    const delivery = deferred();
    const onError = vi.fn();
    const failure = new Error("private response delivery failure");
    let context!: ToolContext;
    const server = createServer({
      name: "delivery",
      version: "1",
      onError,
      tools: {
        work: tool({
          input: z.object({}),
          execute(_input, ctx) {
            context = ctx;
            return "done";
          },
        }),
      },
    });
    const options = {
      protocolVersion: PROTOCOL_VERSION,
      [Symbol.for("@toolgrain/mcp/response-delivery/v1")]: async (
        response: unknown,
      ) => {
        expect(response).toHaveProperty("result.content.0.text", "done");
        started.resolve();
        await delivery.promise;
      },
    } as const;
    const pending = server.handle(call(PROTOCOL_VERSION), options);
    await started.promise;
    try {
      if (action === "shutdown") await server.close();
      else if (action === "failure") delivery.reject(failure);
      else delivery.resolve();
      const response = await pending;
      if (action === "complete") {
        expect(response).toHaveProperty("result");
        await server.close();
        expect(context.signal.aborted).toBe(false);
      } else {
        expect(response).toBeUndefined();
        expect(context.signal.aborted).toBe(true);
      }
      if (action === "failure") {
        expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
        expect(context.signal.reason.message).toBe("Response delivery failed");
      } else expect(onError).not.toHaveBeenCalled();
    } finally {
      // Shutdown must not wait for a delivery integration that ignores abort.
      delivery.reject(failure);
      await server.close();
    }
  },
);

it("keeps a cancelled stdio request id reserved until the handler settles", async () => {
  const gate = deferred();
  const started = deferred();
  const transport = new MemoryTransport();
  const execute = vi.fn(async () => {
    started.resolve();
    await gate.promise;
    return "late";
  });
  const server = createServer({
    name: "progress",
    version: "1",
    tools: { work: tool({ input: z.object({}), execute }) },
  });
  await server.listen(transport);
  try {
    transport.receive(call(PROTOCOL_VERSION));
    await started.promise;
    transport.receive({
      jsonrpc: "2.0",
      method: "notifications/cancelled",
      params: { requestId: 1 },
    });
    transport.receive(call(PROTOCOL_VERSION));
    await vi.waitFor(() => expect(transport.messages).toHaveLength(1));
    expect(transport.messages[0]).toHaveProperty(
      "error.message",
      "Request ID is already in use",
    );
    expect(execute).toHaveBeenCalledOnce();
  } finally {
    gate.resolve();
    await server.close();
  }
});

it.each(revisions)(
  "sends progress before the final stdio response in %s",
  async (revision) => {
    const transport = new MemoryTransport();
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
      },
    });
    await server.listen(transport);
    await initialize(transport, revision);
    transport.receive(call(revision, "job"));
    await vi.waitFor(() =>
      expect(transport.messages.at(-1)).toHaveProperty("id", 1),
    );
    expect(transport.notifications).toEqual([
      {
        jsonrpc: "2.0",
        method: "notifications/progress",
        params: { progressToken: "job", progress: 1 },
      },
    ]);
    await server.close();
  },
);
