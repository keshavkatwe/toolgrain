import { APPS_PROTOCOL_VERSION } from "@toolgrain/protocol/apps";
import { afterEach, expect, it, vi } from "vitest";
import { connection, required, result } from "./host.js";

// Captured from grok-web 1.0.0's ui/initialize reply on 2026-11-09.
const grok = {
  protocolVersion: "2025-11-21",
  hostInfo: { name: "grok-web", version: "1.0.0" },
  hostCapabilities: {
    openLinks: {},
    serverTools: {},
    serverResources: {},
    logging: {},
  },
  hostContext: {
    theme: "light",
    displayMode: "inline",
    availableDisplayModes: ["inline", "fullscreen"],
    containerDimensions: { maxWidth: 728, maxHeight: 1000 },
  },
};
const cleanups: (() => void)[] = [];
const setup = (options: Parameters<typeof connection>[0] = {}) => {
  const x = connection(options);
  cleanups.push(x.cleanup);
  return x;
};
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
});

it.each([grok.protocolVersion, APPS_PROTOCOL_VERSION])(
  "initializes with host revision %s while advertising the stable revision",
  async (protocolVersion) => {
    const x = setup();
    expect(required(x.messages()[0]).params).toMatchObject({
      protocolVersion: APPS_PROTOCOL_VERSION,
    });
    x.initialize({ ...grok, protocolVersion });
    await x.started;
    expect(x.client.isClosed()).toBe(false);
    expect(x.client.getSnapshot()).toMatchObject({
      status: "waiting",
      host: grok.hostContext,
    });
    expect(
      x.messages().filter((m) => m.method === "ui/notifications/initialized"),
    ).toHaveLength(1);
    x.notify("ui/notifications/tool-input", { arguments: { count: 2 } });
    expect(x.client.getSnapshot()).toMatchObject({
      status: "running",
      input: { count: 2 },
    });
    x.notify("ui/notifications/tool-result", result);
    expect(x.client.getSnapshot()).toMatchObject({ status: "success", result });
    x.notify("ui/notifications/host-context-changed", { theme: "dark" });
    expect(x.client.getSnapshot().host.theme).toBe("dark");
    x.client.size(400, 200);
    expect(x.messages().at(-1)).toMatchObject({
      method: "ui/notifications/size-changed",
      params: { width: 400, height: 200 },
    });
  },
);

it("keeps legacy host actions, refresh, cancellation and teardown on the validated connection", async () => {
  const x = setup();
  x.initialize(grok);
  await x.started;
  expect(x.client.actionAvailability()).toEqual({
    openLink: true,
    sendMessage: false,
    updateModelContext: false,
    displayModes: ["inline"],
  });
  await expect(
    x.client.sendMessage({ role: "user", content: [] }),
  ).rejects.toThrow("message");
  const link = x.client.openLink("https://example.com/accounts");
  x.reply(required(x.messages().at(-1)).id, {});
  await expect(link).resolves.toEqual({});
  const refresh = x.client.callTool("chart", { count: 2 });
  expect(x.messages().at(-1)).toMatchObject({
    method: "tools/call",
    params: { name: "chart", arguments: { count: 2 } },
  });
  x.reply(required(x.messages().at(-1)).id, result);
  await expect(refresh).resolves.toEqual(result);
  const invalid = x.client.callTool("chart", {});
  x.reply(required(x.messages().at(-1)).id, { content: [{ type: "image" }] });
  await expect(invalid).rejects.toThrow();
  const controller = new AbortController();
  const cancelled = x.client.callTool(
    "chart",
    {},
    { signal: controller.signal },
  );
  const request = required(x.messages().at(-1));
  controller.abort(new Error("Stopped"));
  await expect(cancelled).rejects.toThrow("Stopped");
  expect(x.messages().at(-1)).toMatchObject({
    method: "notifications/cancelled",
    params: { requestId: request.id },
  });
  x.reply(request.id, result);
  x.receive({ jsonrpc: "2.0", id: 40, method: "ping" });
  expect(x.messages().at(-1)).toMatchObject({ id: 40, result: {} });
  const pending = x.client.callTool("chart", {});
  x.receive({
    jsonrpc: "2.0",
    id: 41,
    method: "ui/resource-teardown",
    params: {},
  });
  await expect(pending).rejects.toThrow("closed");
  expect(x.client.isClosed()).toBe(true);
});

it("still enforces the message source, configured origin and legacy payload schemas", async () => {
  const x = setup({ hostOrigin: "https://host.example" });
  const reply = {
    jsonrpc: "2.0",
    id: required(x.messages()[0]).id,
    result: grok,
  };
  x.receive(reply, window);
  x.receive(reply, x.parent, "https://other.example");
  await Promise.resolve();
  expect(x.client.getSnapshot().status).toBe("connecting");
  x.initialize(grok);
  await x.started;
  expect(x.client.getSnapshot().status).toBe("waiting");
  x.notify("ui/notifications/tool-result", { content: [{ type: "image" }] });
  expect(x.client.getSnapshot().error?.message).toBe("Invalid tool result");
});

it.each(["", "2025-11-25", "2026-07-28", "2026-01-27", "other"])(
  "rejects unreviewed Apps revision %j without acknowledging initialization",
  async (protocolVersion) => {
    const x = setup();
    x.initialize({ ...grok, protocolVersion });
    await x.started;
    expect(x.client.getSnapshot().error?.message).toBe(
      "Unsupported MCP Apps revision",
    );
    expect(x.client.isClosed()).toBe(true);
    expect(
      x.messages().some((m) => m.method === "ui/notifications/initialized"),
    ).toBe(false);
  },
);

it.each([
  { hostInfo: {} },
  { hostCapabilities: { serverTools: false } },
  { hostContext: { theme: "invalid" } },
])("rejects malformed legacy initialization %j", async (override) => {
  const x = setup();
  x.initialize({ ...grok, ...override });
  await x.started;
  expect(x.client.getSnapshot().status).toBe("error");
  expect(x.client.isClosed()).toBe(true);
  expect(x.messages()).toHaveLength(1);
});
