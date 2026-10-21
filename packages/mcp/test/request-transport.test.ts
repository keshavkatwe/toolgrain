import { expect, it, vi } from "vitest";
import {
  createServer,
  type RequestTransport,
  type Server,
  type TransportCallbacks,
} from "../src/index.js";
import { MemoryTransport } from "./memory.js";

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
