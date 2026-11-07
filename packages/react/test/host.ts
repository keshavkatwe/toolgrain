import { APPS_PROTOCOL_VERSION } from "@toolgrain/protocol/apps";
import { vi } from "vitest";
import { AppClient, type ClientOptions } from "../src/client.js";

export function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error("Missing fixture value");
  return value;
}

export const result = {
  content: [{ type: "text", text: "Summary" }],
  structuredContent: { value: 3 },
  _meta: { view: "chart" },
};
export function host() {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const parent = required(frame.contentWindow);
  Object.defineProperty(window, "parent", {
    value: parent,
    configurable: true,
  });
  const post = vi.spyOn(parent, "postMessage").mockImplementation(() => {});
  const receive = (
    data: unknown,
    source = parent,
    origin = "https://host.example",
  ) =>
    window.dispatchEvent(new MessageEvent("message", { data, source, origin }));
  const reply = (id: string | number, value: unknown) =>
    receive({ jsonrpc: "2.0", id, result: value });
  const notify = (method: string, params: unknown) =>
    receive({ jsonrpc: "2.0", method, params });
  const messages = () =>
    post.mock.calls.map(
      ([message]) => message as { method: string; id: string; params: unknown },
    );
  const initialize = (overrides = {}) =>
    reply(required(messages()[0]).id, {
      protocolVersion: APPS_PROTOCOL_VERSION,
      hostInfo: { name: "test-host", version: "1" },
      hostCapabilities: { serverTools: {} },
      hostContext: {},
      ...overrides,
    });
  return {
    parent,
    post,
    receive,
    reply,
    notify,
    messages,
    initialize,
    cleanup: () => {
      frame.remove();
      Object.defineProperty(window, "parent", {
        value: window,
        configurable: true,
      });
    },
  };
}
export function connection(options: Partial<ClientOptions> = {}) {
  const bridge = host();
  const client = new AppClient({
    appInfo: { name: "test", version: "1" },
    ...(options.resolveTool ? {} : { tool: "chart" }),
    ...options,
  });
  const started = client.start(window);
  return {
    ...bridge,
    client,
    started,
    cleanup: () => {
      client.close();
      bridge.cleanup();
    },
  };
}
