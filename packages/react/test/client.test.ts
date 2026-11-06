import { APPS_PROTOCOL_VERSION } from "@toolgrain/protocol/apps";
import { afterEach, expect, it, vi } from "vitest";
import { AppClient, deadline } from "../src/client.js";
import { connection, host, required, result } from "./host.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const setup = (options: Parameters<typeof connection>[0] = {}) => {
  const value = connection(options);
  cleanups.push(value.cleanup);
  return value;
};

it("installs before handshake, negotiates Apps independently, and retains data", async () => {
  const x = setup();
  expect(x.messages()[0]).toMatchObject({
    method: "ui/initialize",
    params: {
      protocolVersion: APPS_PROTOCOL_VERSION,
      appCapabilities: { availableDisplayModes: ["inline"] },
    },
  });
  x.notify("ui/notifications/tool-result", result);
  expect(x.client.getSnapshot().result).toBeUndefined();
  x.initialize({ hostContext: { theme: "dark", locale: "en" } });
  await x.started;
  expect(required(x.messages()[1]).method).toBe("ui/notifications/initialized");
  const listener = vi.fn();
  const unsubscribe = x.client.subscribe(listener);
  x.notify("ui/notifications/tool-input", { arguments: { count: "2" } });
  expect(x.client.getSnapshot()).toMatchObject({
    status: "running",
    input: { count: "2" },
  });
  x.notify("ui/notifications/tool-result", result);
  expect(x.client.getSnapshot()).toMatchObject({
    status: "success",
    toolName: "chart",
    result,
  });
  x.notify("ui/notifications/host-context-changed", { theme: "light" });
  expect(x.client.getSnapshot().host).toEqual({ theme: "light", locale: "en" });
  unsubscribe();
  expect(listener).toHaveBeenCalledTimes(3);
  await x.client.start(window);
  expect(x.messages().filter((m) => m.method === "ui/initialize")).toHaveLength(
    1,
  );
});

it("ignores malformed/unrelated traffic and enforces an optional origin", async () => {
  const x = setup({ hostOrigin: "https://host.example" });
  x.receive(
    { jsonrpc: "2.0", id: required(x.messages()[0]).id, result: {} },
    window,
  );
  x.receive(
    { jsonrpc: "2.0", id: required(x.messages()[0]).id, result: {} },
    x.parent,
    "https://other.example",
  );
  x.receive(null);
  x.receive({ jsonrpc: "1", id: 1 });
  x.receive({ jsonrpc: "2.0" });
  x.receive({ jsonrpc: "2.0", id: "unmatched", result: {} });
  x.initialize();
  await x.started;
  x.notify("ui/notifications/tool-input", { arguments: [] });
  x.notify("ui/notifications/tool-cancelled", { reason: 4 });
  x.notify("ui/notifications/host-context-changed", { theme: "pink" });
  x.notify("ui/notifications/tool-input-partial", { arguments: {} });
  expect(x.client.getSnapshot().status).toBe("waiting");
});

it("accepts structured-cloned optional host fields without weakening payload validation", async () => {
  const x = setup();
  x.receive({
    jsonrpc: "2.0",
    id: required(x.messages()[0]).id,
    error: undefined,
    result: {
      protocolVersion: APPS_PROTOCOL_VERSION,
      hostInfo: { name: "host", version: "1" },
      hostCapabilities: { serverTools: {}, logging: undefined },
      hostContext: {
        styles: { variables: { "--font-sans": undefined } },
        containerDimensions: { width: 600, height: undefined },
      },
    },
  });
  await x.started;
  expect(x.client.getSnapshot().status).toBe("waiting");
  x.notify("ui/notifications/tool-result", {
    content: [],
    structuredContent: new Date(),
  });
  expect(x.client.getSnapshot().error?.message).toBe("Invalid tool result");
});

it.each([
  { protocolVersion: "other" },
  { hostInfo: {} },
  { hostCapabilities: { serverTools: false } },
])("rejects invalid handshake %j", async (overrides) => {
  const x = setup();
  x.initialize(overrides);
  await x.started;
  expect(x.client.getSnapshot().status).toBe("error");
  expect(x.client.isClosed()).toBe(true);
});

it("routes shared results and reports missing or throwing selectors", async () => {
  const resolveTool = vi.fn((): string | undefined => "sales");
  const x = setup({ resolveTool });
  x.initialize();
  await x.started;
  x.notify("ui/notifications/tool-result", result);
  expect(x.client.getSnapshot().toolName).toBe("sales");
  x.notify("ui/notifications/tool-input", { arguments: { city: "Dubai" } });
  expect(x.client.getSnapshot()).toMatchObject({
    status: "running",
    input: { city: "Dubai" },
  });
  expect(x.client.getSnapshot().toolName).toBeUndefined();
  expect(x.client.getSnapshot().result).toBeUndefined();
  resolveTool.mockReturnValue(undefined);
  x.notify("ui/notifications/tool-result", result);
  expect(x.client.getSnapshot().error?.message).toContain("route");
  resolveTool.mockImplementation(() => {
    throw "private";
  });
  x.notify("ui/notifications/tool-result", result);
  expect(x.client.getSnapshot().error?.message).toBe("Tool routing failed");
  x.notify("ui/notifications/tool-result", { content: [{ type: "image" }] });
  expect(x.client.getSnapshot().error?.message).toBe("Invalid tool result");
});

it("supports expected tool errors and suppresses results after cancellation", async () => {
  const x = setup();
  x.initialize();
  await x.started;
  x.notify("ui/notifications/tool-result", { content: [], isError: true });
  expect(x.client.getSnapshot().status).toBe("tool-error");
  x.notify("ui/notifications/tool-cancelled", {});
  x.notify("ui/notifications/tool-result", result);
  expect(x.client.getSnapshot().status).toBe("cancelled");
  x.notify("ui/notifications/tool-input", { arguments: {} });
  x.notify("ui/notifications/tool-cancelled", { reason: "Stopped" });
  expect(x.client.getSnapshot().error?.message).toBe("Stopped");
});

it("matches independent concurrent calls, preserves envelopes, and rejects RPC failures", async () => {
  const x = setup();
  await expect(x.client.callTool("chart", {})).rejects.toThrow("not ready");
  x.initialize();
  await x.started;
  const first = x.client.callTool("chart", {});
  const second = x.client.callTool("chart", {});
  const requests = x.messages().filter((m) => m.method === "tools/call");
  x.reply(required(requests[1]).id, { ...result, isError: true });
  await expect(second).resolves.toEqual({ ...result, isError: true });
  x.receive({
    jsonrpc: "2.0",
    id: required(requests[0]).id,
    error: { code: -32602, message: "Invalid input", data: { field: 1 } },
  });
  await expect(first).rejects.toMatchObject({
    code: -32602,
    message: "Invalid input",
    data: { field: 1 },
  });
  expect(x.client.getSnapshot().result).toBeUndefined();
});

it.each([{ result: {}, error: {} }, {}, { error: { code: "bad" } }])(
  "settles malformed responses %j",
  async (fields) => {
    const x = setup();
    x.initialize();
    await x.started;
    const call = x.client.callTool("chart", {});
    const request = required(x.messages().at(-1));
    x.receive({ jsonrpc: "2.0", id: request.id, ...fields });
    await expect(call).rejects.toThrow("Invalid host");
  },
);

it("validates call results and respects host capabilities", async () => {
  const x = setup();
  x.initialize();
  await x.started;
  const call = x.client.callTool("chart", {});
  x.reply(required(x.messages().at(-1)).id, { content: [], isError: "bad" });
  await expect(call).rejects.toThrow();
  await expect(
    x.client.callTool("chart", { invalid: new Date() }),
  ).rejects.toThrow();
  x.client.close();
  const other = setup();
  other.initialize({ hostCapabilities: {} });
  await other.started;
  await expect(other.client.callTool("chart", {})).rejects.toThrow(
    "does not support",
  );
});

it("cancels locally, signals the host, and ignores late replies", async () => {
  const x = setup();
  x.initialize();
  await x.started;
  const signal = new AbortController();
  signal.abort(new Error("Already stopped"));
  await expect(
    x.client.callTool("chart", {}, { signal: signal.signal }),
  ).rejects.toThrow("Already stopped");
  const controller = new AbortController();
  const call = x.client.callTool("chart", {}, { signal: controller.signal });
  const request = required(x.messages().at(-1));
  controller.abort(new Error("Stopped"));
  await expect(call).rejects.toThrow("Stopped");
  expect(x.messages().at(-1)).toMatchObject({
    method: "notifications/cancelled",
    params: { requestId: request.id },
  });
  x.reply(request.id, result);
});

it("times out initialization and individual calls without dangling timers", async () => {
  vi.useFakeTimers();
  const x = setup({ timeoutMs: 10 });
  await vi.advanceTimersByTimeAsync(10);
  await x.started;
  expect(x.client.getSnapshot().error?.message).toContain("timed out");
  const other = setup();
  other.initialize();
  await other.started;
  const call = other.client.callTool("chart", {}, { timeoutMs: 5 });
  const rejected = expect(call).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(5);
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
});

it("answers ping/unknown methods, closes on teardown, and rejects pending calls", async () => {
  const x = setup();
  x.initialize();
  await x.started;
  x.receive({ jsonrpc: "2.0", id: 40, method: "ping" });
  expect(x.post).toHaveBeenLastCalledWith(
    { jsonrpc: "2.0", id: 40, result: {} },
    "*",
  );
  x.receive({ jsonrpc: "2.0", id: 41, method: "unknown" });
  expect(x.messages().at(-1)).toMatchObject({
    id: 41,
    error: { code: -32601 },
  });
  const call = x.client.callTool("chart", {});
  x.receive({
    jsonrpc: "2.0",
    id: 42,
    method: "ui/resource-teardown",
    params: {},
  });
  await expect(call).rejects.toThrow("closed");
  expect(x.client.getSnapshot().status).toBe("closed");
  x.client.close();
  x.notify("ui/notifications/tool-result", result);
  x.client.size(10, 20);
  await expect(x.client.callTool("chart", {})).rejects.toThrow("not ready");
});

it("requires a host and rejects competing providers", async () => {
  const standalone = new AppClient({ appInfo: { name: "app", version: "1" } });
  Object.defineProperty(window, "parent", {
    value: window,
    configurable: true,
  });
  await standalone.start(window);
  expect(standalone.getSnapshot().error?.message).toContain("embedding host");
  const x = setup();
  const competing = new AppClient({ appInfo: { name: "other", version: "1" } });
  await competing.start(window);
  expect(competing.getSnapshot().error?.message).toContain("Only one");
  x.initialize();
  await x.started;
});

it("settles send failures and cleans up failed notifications", async () => {
  const x = setup();
  x.initialize();
  await x.started;
  x.post.mockImplementation(() => {
    throw new Error("post failed");
  });
  await expect(x.client.callTool("chart", {})).rejects.toThrow("post failed");
  x.client.size(20, 30);
  expect(x.client.getSnapshot().error?.message).toBe("post failed");
  const y = host();
  cleanups.push(y.cleanup);
  y.post.mockImplementation(() => {
    throw "bad";
  });
  const client = new AppClient({ appInfo: { name: "x", version: "1" } });
  await client.start(window);
  expect(client.getSnapshot().error?.message).toBe(
    "Apps initialization failed",
  );
});

it("validates provider settings and timer ranges", () => {
  for (const value of [0, -1, NaN, Infinity, 1.5, 2_147_483_648])
    expect(() => deadline(value)).toThrow();
  expect(deadline()).toBe(30_000);
  expect(() => new AppClient({ appInfo: { name: "", version: "1" } })).toThrow(
    "name and version",
  );
});

it("closes safely while initialization is pending and after non-Error notification failures", async () => {
  const x = setup();
  x.client.close();
  await x.started;
  expect(x.client.getSnapshot().status).toBe("closed");
  const y = setup();
  y.initialize();
  await y.started;
  const controller = new AbortController();
  const call = y.client.callTool("chart", {}, { signal: controller.signal });
  y.post.mockImplementation(() => {
    throw "cannot send";
  });
  controller.abort(new Error("Cancelled"));
  await expect(call).rejects.toThrow("Cancelled");
  y.client.size(1, 2);
  expect(y.client.getSnapshot().error?.message).toBe(
    "Size notification failed",
  );
});

it("handles throwing selectors, cyclic messages and failed host requests without escaping listeners", async () => {
  const x = setup({
    resolveTool: () => {
      throw new Error("selector error");
    },
  });
  x.initialize();
  await x.started;
  x.notify("ui/notifications/tool-result", result);
  expect(x.client.getSnapshot().error?.message).toBe("selector error");
  const cyclic: Record<string, unknown> = { jsonrpc: "2.0" };
  cyclic.loop = cyclic;
  expect(() => x.receive(cyclic)).not.toThrow();
  expect(x.client.isClosed()).toBe(false);
  x.client.close();
  const y = setup();
  y.initialize();
  await y.started;
  y.post.mockImplementation(() => {
    throw new Error("Disconnected");
  });
  expect(() =>
    y.receive({ jsonrpc: "2.0", id: 1, method: "ping" }),
  ).not.toThrow();
  expect(y.client.isClosed()).toBe(true);
});
