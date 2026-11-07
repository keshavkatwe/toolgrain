import { afterEach, expect, it, vi } from "vitest";
import { AppClient } from "../src/client.js";
import { connection, required, result } from "./host.js";

const cleanups: (() => void)[] = [];
const setup = (options: Parameters<typeof connection>[0] = {}) => {
  const x = connection(options);
  cleanups.push(x.cleanup);
  return x;
};
const capabilities = {
  openLinks: {},
  message: { text: {}, image: {}, audio: {}, resource: {}, resourceLink: {} },
  updateModelContext: { text: {}, structuredContent: {} },
};
const text = [{ type: "text", text: "Explain this view" }] as const;
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("gates actions on initialization and explicit advertisements, without posting unsupported requests", async () => {
  const x = setup();
  expect(x.client.actionAvailability()).toEqual({
    openLink: false,
    sendMessage: false,
    updateModelContext: false,
    displayModes: [],
  });
  await expect(x.client.openLink("https://example.com")).rejects.toThrow(
    "not ready",
  );
  await expect(
    x.client.sendMessage({ role: "user", content: text }),
  ).rejects.toThrow("not ready");
  await expect(x.client.updateModelContext({})).rejects.toThrow("not ready");
  await expect(x.client.requestDisplayMode("inline")).rejects.toThrow(
    "not ready",
  );
  x.initialize();
  await x.started;
  expect(x.client.actionAvailability().displayModes).toEqual([]);
  const count = x.messages().length;
  await expect(x.client.openLink("https://example.com")).rejects.toThrow(
    "openLinks",
  );
  await expect(
    x.client.sendMessage({ role: "user", content: text }),
  ).rejects.toThrow("message");
  await expect(x.client.updateModelContext({})).rejects.toThrow(
    "updateModelContext",
  );
  await expect(x.client.requestDisplayMode("inline")).rejects.toThrow(
    "not available",
  );
  expect(x.messages()).toHaveLength(count);
});

it("correlates concurrent host actions, preserves replies and keeps initiating data separate", async () => {
  const modes = ["inline", "fullscreen"] as const;
  const x = setup({ availableDisplayModes: modes });
  expect(required(x.messages()[0]).params).toMatchObject({
    appCapabilities: { availableDisplayModes: modes },
  });
  x.initialize({
    hostCapabilities: capabilities,
    hostContext: {
      displayMode: "inline",
      availableDisplayModes: ["inline", "fullscreen", "pip"],
    },
  });
  await x.started;
  x.notify("ui/notifications/tool-result", result);
  const snapshot = x.client.getSnapshot();
  const content = [
    ...text,
    { type: "image", data: "aGVsbG8=", mimeType: "image/png" },
    { type: "audio", data: "aGVsbG8=", mimeType: "audio/wav" },
    { type: "resource_link", uri: "ui://view", name: "View" },
    { type: "resource", resource: { uri: "file:///view", text: "View" } },
  ] as const;
  const open = x.client.openLink("https://example.com/details");
  const message = x.client.sendMessage({ role: "user", content });
  const context = x.client.updateModelContext({
    content: text,
    structuredContent: { selection: [1, 2] },
  });
  const display = x.client.requestDisplayMode("fullscreen");
  const requests = x
    .messages()
    .filter(
      (m) => m.method.startsWith("ui/") && m.id && m.method !== "ui/initialize",
    );
  expect(requests.map((request) => request.method)).toEqual([
    "ui/open-link",
    "ui/message",
    "ui/update-model-context",
    "ui/request-display-mode",
  ]);
  expect(requests.map((request) => request.params)).toEqual([
    { url: "https://example.com/details" },
    { role: "user", content },
    { content: text, structuredContent: { selection: [1, 2] } },
    { mode: "fullscreen" },
  ]);
  x.reply(required(requests[3]).id, { mode: "inline", reason: "declined" });
  x.reply(required(requests[2]).id, { accepted: true });
  x.reply(required(requests[1]).id, { isError: true, reason: "denied" });
  x.reply(required(requests[0]).id, { isError: undefined, extra: 1 });
  await expect(display).resolves.toEqual({
    mode: "inline",
    reason: "declined",
  });
  await expect(context).resolves.toEqual({ accepted: true });
  await expect(message).resolves.toEqual({ isError: true, reason: "denied" });
  await expect(open).resolves.toEqual({ isError: undefined, extra: 1 });
  expect(x.client.getSnapshot()).toBe(snapshot);
  x.notify("ui/notifications/host-context-changed", {
    displayMode: "fullscreen",
    availableDisplayModes: ["fullscreen"],
  });
  expect(x.client.getSnapshot().host.displayMode).toBe("fullscreen");
  expect(x.client.actionAvailability().displayModes).toEqual(["fullscreen"]);
  x.client.close();
  expect(x.client.actionAvailability().openLink).toBe(false);
});

it("validates outgoing inputs and advertised content kinds before sending", async () => {
  const x = setup();
  x.initialize({
    hostCapabilities: {
      openLinks: {},
      message: { text: {} },
      updateModelContext: {},
    },
    hostContext: { availableDisplayModes: ["inline", "fullscreen"] },
  });
  await x.started;
  const count = x.messages().length;
  await expect(x.client.openLink("/relative")).rejects.toThrow();
  await expect(
    x.client.sendMessage({ role: "assistant", content: text } as never),
  ).rejects.toThrow();
  await expect(
    x.client.sendMessage({
      role: "user",
      content: [{ type: "image" }],
    } as never),
  ).rejects.toThrow();
  await expect(
    x.client.sendMessage({
      role: "user",
      content: [{ type: "image", data: "", mimeType: "image/png" }],
    }),
  ).rejects.toThrow("image");
  await expect(x.client.updateModelContext({ content: text })).rejects.toThrow(
    "text",
  );
  await expect(
    x.client.updateModelContext({ structuredContent: {} }),
  ).rejects.toThrow("structuredContent");
  await expect(
    x.client.updateModelContext({ structuredContent: new Date() } as never),
  ).rejects.toThrow();
  await expect(x.client.requestDisplayMode("other" as never)).rejects.toThrow();
  await expect(x.client.requestDisplayMode("fullscreen")).rejects.toThrow(
    "not available",
  );
  expect(x.messages()).toHaveLength(count);
  const cleared = x.client.updateModelContext({});
  x.reply(required(x.messages().at(-1)).id, {});
  await expect(cleared).resolves.toEqual({});
});

it("rejects malformed acknowledgements and undeclared response display modes", async () => {
  const x = setup();
  x.initialize({
    hostCapabilities: capabilities,
    hostContext: { availableDisplayModes: ["inline"] },
  });
  await x.started;
  const open = x.client.openLink("https://example.com");
  x.reply(required(x.messages().at(-1)).id, { isError: "bad" });
  await expect(open).rejects.toThrow();
  const message = x.client.sendMessage({ role: "user", content: text });
  x.reply(required(x.messages().at(-1)).id, null);
  await expect(message).rejects.toThrow();
  const context = x.client.updateModelContext({});
  x.reply(required(x.messages().at(-1)).id, []);
  await expect(context).rejects.toThrow();
  for (const response of [{ mode: "other" }, { mode: "pip" }]) {
    const display = x.client.requestDisplayMode("inline");
    x.reply(required(x.messages().at(-1)).id, response);
    await expect(display).rejects.toThrow();
  }
  const denied = x.client.openLink("https://example.com");
  x.receive({
    jsonrpc: "2.0",
    id: required(x.messages().at(-1)).id,
    error: { code: -32000, message: "Policy denied", data: { reason: "url" } },
  });
  await expect(denied).rejects.toMatchObject({
    code: -32000,
    message: "Policy denied",
    data: { reason: "url" },
  });
  x.post.mockImplementation(() => {
    throw new Error("send failed");
  });
  await expect(x.client.openLink("https://example.com")).rejects.toThrow(
    "send failed",
  );
});

it("shares abort/deadline/teardown cleanup and suppresses late action replies", async () => {
  vi.useFakeTimers();
  const x = setup();
  x.initialize({ hostCapabilities: capabilities });
  await x.started;
  const stopped = new AbortController();
  stopped.abort(new Error("Already stopped"));
  await expect(
    x.client.openLink("https://example.com", { signal: stopped.signal }),
  ).rejects.toThrow("Already stopped");
  const controller = new AbortController();
  const context = x.client.updateModelContext(
    {},
    { signal: controller.signal },
  );
  const request = required(x.messages().at(-1));
  controller.abort(new Error("Stopped"));
  await expect(context).rejects.toThrow("Stopped");
  expect(x.messages().at(-1)).toMatchObject({
    method: "notifications/cancelled",
    params: { requestId: request.id },
  });
  x.reply(request.id, {});
  const message = x.client.sendMessage(
    { role: "user", content: text },
    { timeoutMs: 5 },
  );
  const rejection = expect(message).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(5);
  await rejection;
  const open = x.client.openLink("https://example.com");
  x.receive({
    jsonrpc: "2.0",
    id: "teardown",
    method: "ui/resource-teardown",
    params: {},
  });
  await expect(open).rejects.toThrow("closed");
  expect(vi.getTimerCount()).toBe(0);
});

it.each([
  { openLinks: true },
  { message: { text: false } },
  { updateModelContext: { structuredContent: true } },
])("rejects malformed advertised actions %j", async (hostCapabilities) => {
  const x = setup();
  x.initialize({ hostCapabilities });
  await x.started;
  expect(x.client.isClosed()).toBe(true);
});

it("validates and copies provider display modes", async () => {
  for (const modes of [[], ["other"]])
    expect(
      () =>
        new AppClient({
          appInfo: { name: "app", version: "1" },
          availableDisplayModes: modes as never,
        }),
    ).toThrow();
  const modes: ("inline" | "fullscreen")[] = ["inline", "fullscreen"];
  const x = setup({ availableDisplayModes: modes });
  modes.pop();
  expect(required(x.messages()[0]).params).toMatchObject({
    appCapabilities: { availableDisplayModes: ["inline", "fullscreen"] },
  });
  x.initialize({ hostContext: { availableDisplayModes: ["fullscreen"] } });
  await x.started;
  expect(x.client.actionAvailability().displayModes).toEqual(["fullscreen"]);
});
