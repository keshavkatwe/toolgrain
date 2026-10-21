import { expect, it, vi } from "vitest";
import {
  createServer,
  type RequestTransport,
  type Server,
  type Transport,
  type TransportCallbacks,
} from "../src/index.js";
import { deferred, MemoryTransport } from "./memory.js";

it("starts request transports with the server and coordinates listener errors and closure", async () => {
  let callbacks!: Pick<TransportCallbacks, "onError" | "onClose">;
  let attached!: Server;
  const close = vi.fn(async () => {});
  const transport: RequestTransport = {
    mode: "request",
    close,
    async start(server, lifecycle) {
      attached = server;
      callbacks = lifecycle;
    },
  };
  const onError = vi.fn();
  const server = createServer({
    name: "requests",
    version: "1",
    tools: {},
    onError,
  });
  await server.listen(transport);
  expect(attached).toBe(server);
  await expect(server.listen(new MemoryTransport())).rejects.toThrow(
    "one transport",
  );
  callbacks.onError(new Error("listener failed"));
  await server.close();
  expect(close).toHaveBeenCalledOnce();
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({ message: "listener failed" }),
  );
  callbacks.onClose();
  await server.close();
});

it("allows protected servers to attach request transports while denying unauthenticated handle calls", async () => {
  const server = createServer({
    name: "protected",
    version: "1",
    tools: {},
    auth: {
      type: Symbol.for("request-transport-test"),
      authorizationServers: ["https://auth.example.com"],
      async verify() {
        return {};
      },
    },
  });
  const close = vi.fn(async () => {});
  await server.listen({
    mode: "request",
    close,
    async start(attached) {
      await expect(attached.handle({})).rejects.toHaveProperty(
        "code",
        "invalid_token",
      );
    },
  });
  await server.close();
  expect(close).toHaveBeenCalledOnce();
});

it.each(["message", "request"] as const)(
  "claims frozen %s transports before startup and preserves the owner on reuse",
  async (mode) => {
    const close = vi.fn(async () => {});
    const start = vi.fn(async () => {});
    const transport: Transport | RequestTransport =
      mode === "message"
        ? Object.freeze({ mode, start, close, async send() {} })
        : Object.freeze({ mode, start, close });
    const first = createServer({ name: "first", version: "1", tools: {} });
    const second = createServer({ name: "second", version: "1", tools: {} });
    try {
      await first.listen(transport);
      await expect(second.listen(transport)).rejects.toThrow();
      expect(start).toHaveBeenCalledOnce();
      expect(close).not.toHaveBeenCalled();
      await second.close();
      expect(close).not.toHaveBeenCalled();
    } finally {
      await first.close();
      await second.close();
    }
    expect(close).toHaveBeenCalledOnce();
  },
);
it("claims a transport while startup is pending", async () => {
  const ready = deferred();
  const close = vi.fn(async () => {});
  const start = vi.fn(async () => ready.promise);
  const transport: RequestTransport = { mode: "request", start, close };
  const first = createServer({ name: "pending", version: "1", tools: {} });
  const second = createServer({ name: "other", version: "1", tools: {} });
  const pending = first.listen(transport);
  try {
    const attempt = second.listen(transport);
    ready.resolve();
    await expect(attempt).rejects.toThrow("already attached");
    expect(start).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
  } finally {
    ready.resolve();
    await pending;
    await Promise.all([first.close(), second.close()]);
  }
});
it("preserves transport ownership across compatible package copies", async () => {
  const close = vi.fn(async () => {});
  const transport: RequestTransport = Object.freeze({
    mode: "request",
    close,
    async start() {},
  });
  const first = createServer({ name: "first-copy", version: "1", tools: {} });
  await first.listen(transport);
  vi.resetModules();
  const { createServer: createCopy } = await import("../src/index.js");
  const second = createCopy({ name: "second-copy", version: "1", tools: {} });
  try {
    await expect(second.listen(transport)).rejects.toThrow();
    await second.close();
    expect(close).not.toHaveBeenCalled();
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
});
