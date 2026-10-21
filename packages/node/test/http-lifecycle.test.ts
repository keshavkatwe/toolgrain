import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import { createServer } from "@toolgrain/mcp";
import { expect, it, vi } from "vitest";
import { createNodeHttpHandler } from "../src/index.js";

function fixture() {
  const input = new PassThrough() as unknown as IncomingMessage;
  Object.assign(input, {
    rawHeaders: ["Host", "localhost"],
    headers: { host: "localhost" },
    socket: {},
    url: "/mcp",
    method: "GET",
  });
  const output = Object.assign(new EventEmitter(), {
    writableFinished: false,
    destroyed: false,
    headersSent: false,
    writeHead: vi.fn(),
    end: vi.fn(),
    write: vi.fn(() => true),
    destroy: vi.fn(),
  });
  output.writeHead.mockReturnValue(output);
  output.end.mockImplementation(() => {
    queueMicrotask(() => {
      output.writableFinished = true;
      output.emit("finish");
    });
  });
  const server = createServer({ name: "test", version: "1", tools: {} });
  return { input, output, handler: createNodeHttpHandler(server) };
}
it("rejects consumed input", async () => {
  const { input, output, handler } = fixture();
  input.setEncoding("utf8");
  await handler(input, output as unknown as ServerResponse);
  expect(output.writeHead).toHaveBeenCalledWith(400);
});
it("sends internal failures only if the connection remains usable", async () => {
  for (const sent of [false, true]) {
    const { input, output, handler } = fixture();
    output.headersSent = sent;
    Object.assign(input, { method: "INVALID METHOD" });
    await handler(input, output as unknown as ServerResponse);
    if (sent) expect(output.destroy).toHaveBeenCalledOnce();
    else expect(output.writeHead).toHaveBeenCalledWith(500);
  }
});
it("propagates abort and cleans up response listeners", async () => {
  const { input, output, handler } = fixture();
  const result = handler(input, output as unknown as ServerResponse);
  output.emit("close");
  await result;
  expect(output.end).not.toHaveBeenCalled();
  expect(output.listenerCount("close")).toBe(0);
});
it("waits for writable backpressure", async () => {
  const { input, output, handler } = fixture();
  Object.assign(input, {
    method: "POST",
    rawHeaders: ["Host", "localhost", "Content-Type", "text/plain"],
  });
  output.write.mockImplementation(() => {
    queueMicrotask(() => output.emit("drain"));
    return false;
  });
  await handler(input, output as unknown as ServerResponse);
  expect(output.write).toHaveBeenCalled();
  expect(output.end).toHaveBeenCalledOnce();
});
it("handles abort while waiting for writable backpressure", async () => {
  const { input, output, handler } = fixture();
  Object.assign(input, {
    method: "POST",
    rawHeaders: ["Host", "localhost", "Content-Type", "text/plain"],
  });
  output.write.mockImplementation(() => {
    queueMicrotask(() => output.emit("close"));
    return false;
  });
  await handler(input, output as unknown as ServerResponse);
  expect(output.end).not.toHaveBeenCalled();
});

it("keeps connection error handling until the response finishes", async () => {
  const { input, output, handler } = fixture();
  output.end.mockImplementation(() => {
    queueMicrotask(() => output.emit("error", new Error("flush failed")));
  });
  await handler(input, output as unknown as ServerResponse);
  expect(output.listenerCount("error")).toBe(0);
  expect(output.listenerCount("finish")).toBe(0);
});
it("cleans up when ending a response throws", async () => {
  const { input, output, handler } = fixture();
  output.end.mockImplementation(() => {
    throw new Error("end failed");
  });
  await handler(input, output as unknown as ServerResponse);
  expect(output.destroy).toHaveBeenCalled();
  expect(output.listenerCount("finish")).toBe(0);
});
it("handles a failed error-response flush", async () => {
  const { input, output, handler } = fixture();
  input.setEncoding("utf8");
  output.end.mockImplementation(() => {
    queueMicrotask(() => output.emit("error", new Error("flush failed")));
  });
  await handler(input, output as unknown as ServerResponse);
  expect(output.destroy).toHaveBeenCalled();
  expect(output.listenerCount("error")).toBe(0);
});

it("delegates unrelated middleware requests before inspecting or consuming their bodies", async () => {
  const { input, output, handler } = fixture();
  Object.assign(input, { url: "/rest?trace=1", method: "POST" });
  input.setEncoding("utf8");
  input.push('{"message":"untouched"}');
  input.push(null);
  const next = vi.fn();
  await handler(input, output as unknown as ServerResponse, next);
  expect(next).toHaveBeenCalledOnce();
  expect(output.writeHead).not.toHaveBeenCalled();
  expect(input.read()).toBe('{"message":"untouched"}');
  expect(output.listenerCount("close")).toBe(0);
});
it("does not delegate matched MCP requests to later framework middleware", async () => {
  const { input, output, handler } = fixture();
  const next = vi.fn();
  await handler(input, output as unknown as ServerResponse, next);
  expect(output.writeHead).toHaveBeenCalledWith(405, expect.anything());
  expect(next).not.toHaveBeenCalled();
});
