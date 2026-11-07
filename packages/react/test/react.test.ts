import { tool } from "@toolgrain/mcp";
import { act, createElement as h, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { createApp, type HostActions } from "../src/index.js";
import { presentation } from "../src/presentation.js";
import { connection, host, required, result } from "./host.js";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const definition = tool({ input: z.object({}), execute: () => ({ value: 3 }) });
const tools = { chart: definition, other: definition };
const identity = { name: "React test", version: "1" };
const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.restoreAllMocks();
});
function render() {
  const bridge = host();
  cleanups.push(bridge.cleanup);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  cleanups.push(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  return { ...bridge, container, root };
}
const mount = (root: Root, node: Parameters<Root["render"]>[0]) =>
  act(async () => root.render(node));

it("is SSR-safe and requires provider/routing identity", () => {
  const app = createApp<typeof tools>();
  expect(
    renderToString(
      h(
        app.AppProvider,
        { appInfo: identity, tool: "chart" },
        h("p", null, "SSR"),
      ),
    ),
  ).toContain("SSR");
  expect(() =>
    renderToString(
      h(() => {
        app.useHostContext();
        return null;
      }),
    ),
  ).toThrow("AppProvider");
  expect(() =>
    renderToString(h(app.AppProvider, { appInfo: identity } as never)),
  ).toThrow("exactly one");
});

it("keeps host actions SSR-safe and requires their provider", () => {
  const app = createApp<typeof tools>();
  function Actions() {
    const actions = app.useHostActions();
    return h("p", null, String(actions.available.openLink));
  }
  expect(
    renderToString(
      h(app.AppProvider, { appInfo: identity, tool: "chart" }, h(Actions)),
    ),
  ).toContain("false");
  expect(() => renderToString(h(Actions))).toThrow("AppProvider");
});

it("shares stable host-action callbacks, reacts to availability and separates initiating results", async () => {
  const app = createApp<typeof tools>();
  const x = render();
  let actions: HostActions | undefined;
  function Actions() {
    actions = app.useHostActions();
    const state = app.useToolResult("chart");
    return h(
      "p",
      null,
      `${actions.available.openLink}:${actions.available.displayModes.join(",")}:${state.status}`,
    );
  }
  await mount(
    x.root,
    h(
      StrictMode,
      null,
      h(
        app.AppProvider,
        {
          appInfo: identity,
          tool: "chart",
          availableDisplayModes: ["inline", "fullscreen"],
        },
        h(Actions),
      ),
    ),
  );
  expect(
    x.messages().filter((request) => request.method === "ui/initialize"),
  ).toHaveLength(1);
  expect(required(x.messages()[0]).params).toMatchObject({
    appCapabilities: { availableDisplayModes: ["inline", "fullscreen"] },
  });
  expect(x.container.textContent).toBe("false::connecting");
  const first = required(actions);
  await act(async () =>
    x.initialize({
      hostCapabilities: {
        openLinks: {},
        message: { text: {} },
        updateModelContext: { structuredContent: {} },
      },
      hostContext: { availableDisplayModes: ["inline", "fullscreen"] },
    }),
  );
  await act(async () => x.notify("ui/notifications/tool-result", result));
  expect(x.container.textContent).toBe("true:inline,fullscreen:success");
  const active = required(actions);
  expect(active.openLink).toBe(first.openLink);
  const pending = [
    active.openLink("https://example.com", { timeoutMs: 2000 }),
    active.sendMessage({
      role: "user",
      content: [{ type: "text", text: "Explain" }],
    }),
    active.updateModelContext({ structuredContent: { selection: 1 } }),
    active.requestDisplayMode("fullscreen"),
  ];
  const requests = x.messages().slice(-4);
  await act(async () => {
    for (const request of requests)
      x.reply(
        request.id,
        request.method === "ui/request-display-mode" ? { mode: "inline" } : {},
      );
    await Promise.all(pending);
  });
  expect(x.container.textContent).toContain("success");
  await act(async () =>
    x.notify("ui/notifications/host-context-changed", {
      availableDisplayModes: ["inline"],
    }),
  );
  expect(x.container.textContent).toBe("true:inline:success");
  expect(required(actions).sendMessage).toBe(first.sendMessage);
  expect(required(actions).updateModelContext).toBe(first.updateModelContext);
  expect(required(actions).requestDisplayMode).toBe(first.requestDisplayMode);
  const outstanding = active.openLink("https://example.com");
  const rejection = expect(outstanding).rejects.toThrow("closed");
  await act(async () =>
    x.receive({
      jsonrpc: "2.0",
      id: 20,
      method: "ui/resource-teardown",
      params: {},
    }),
  );
  await rejection;
  expect(x.container.textContent).toBe("false::closed");
});

it("has one Strict Mode handshake and retains results delivered before child subscription", async () => {
  const app = createApp<typeof tools>();
  const x = render();
  const wrapped = (child?: ReturnType<typeof h>) =>
    h(
      StrictMode,
      null,
      h(app.AppProvider, { appInfo: identity, tool: "chart" }, child),
    );
  await mount(x.root, wrapped());
  expect(x.messages().filter((m) => m.method === "ui/initialize")).toHaveLength(
    1,
  );
  await act(async () => {
    x.initialize({ hostContext: { theme: "dark" } });
  });
  await act(async () => {
    x.notify("ui/notifications/tool-result", result);
  });
  function View() {
    const state = app.useToolResult("chart");
    const other = app.useToolResult("other");
    const hostContext = app.useHostContext();
    return h(
      "p",
      null,
      `${state.status}:${state.result?.structuredContent?.value}:${hostContext.theme}:${other.status}`,
    );
  }
  await mount(x.root, wrapped(h(View)));
  expect(x.container.textContent).toBe("success:3:dark:waiting");
  await act(async () => {
    x.notify("ui/notifications/host-context-changed", { theme: "light" });
  });
  expect(x.container.textContent).toContain("light");
});

it("routes shared entries and exposes the union's active tool", async () => {
  const app = createApp<typeof tools>();
  const x = render();
  function View() {
    const state = app.useToolResult();
    return h("p", null, `${state.toolName}:${state.status}`);
  }
  await mount(
    x.root,
    h(
      app.AppProvider,
      {
        appInfo: identity,
        timeoutMs: 2000,
        hostOrigin: "https://host.example",
        resolveTool: (value) =>
          value._meta?.view === "chart" ? "chart" : undefined,
      },
      h(View),
    ),
  );
  await act(async () => x.initialize());
  await act(async () => x.notify("ui/notifications/tool-result", result));
  expect(x.container.textContent).toBe("chart:success");
  await act(async () =>
    x.notify("ui/notifications/tool-result", { content: [], _meta: {} }),
  );
  expect(x.container.textContent).toContain("error");
});

it("separates interactive state, uses the latest invocation and retains tool errors", async () => {
  const app = createApp<typeof tools>();
  const x = render();
  let call!: ReturnType<typeof app.useToolCall<"chart">>;
  function View() {
    call = app.useToolCall("chart");
    const initial = app.useToolResult("chart");
    return h(
      "p",
      null,
      `${initial.status}:${call.pending}:${call.result?.structuredContent?.value}:${String(call.result?.isError)}`,
    );
  }
  await mount(
    x.root,
    h(app.AppProvider, { appInfo: identity, tool: "chart" }, h(View)),
  );
  await act(async () => x.initialize());
  let first!: ReturnType<typeof call.call>;
  let second!: ReturnType<typeof call.call>;
  await act(async () => {
    first = call.call({});
    second = call.call({});
  });
  expect(x.container.textContent).toContain("waiting:true");
  const requests = x.messages().filter((m) => m.method === "tools/call");
  await act(async () => {
    x.reply(required(requests[1]).id, { ...result, isError: true });
    await second;
  });
  await act(async () => {
    x.reply(required(requests[0]).id, {
      ...result,
      structuredContent: { value: 1 },
    });
    await first;
  });
  expect(x.container.textContent).toBe("waiting:false:3:true");
  let failure!: Promise<unknown>;
  await act(async () => {
    failure = call.call({}).catch((error) => error);
  });
  await act(async () => {
    x.receive({
      jsonrpc: "2.0",
      id: required(x.messages().at(-1)).id,
      error: { code: -1, message: "Denied" },
    });
    await failure;
  });
  expect(call.error).toMatchObject({ message: "Denied" });
});

it("does not update unmounted call hooks or results from a previous tool name", async () => {
  const app = createApp<typeof tools>();
  const x = render();
  let call!: ReturnType<typeof app.useToolCall>;
  function View({ name }: { name: "chart" | "other" }) {
    call = app.useToolCall(name);
    return h("p", null, String(call.pending));
  }
  const view = (name: "chart" | "other") =>
    h(app.AppProvider, { appInfo: identity, tool: "chart" }, h(View, { name }));
  await mount(x.root, view("chart"));
  await act(async () => x.initialize());
  let request!: Promise<unknown>;
  await act(async () => {
    request = call.call({});
  });
  const id = required(x.messages().at(-1)).id;
  await mount(x.root, view("other"));
  expect(call.pending).toBe(false);
  await act(async () => {
    x.reply(id, result);
    await request;
  });
  expect(call.result).toBeUndefined();
});

it("applies/restores host styles and fonts, reports size, and disposes on teardown", async () => {
  const x = connection();
  cleanups.push(x.cleanup);
  vi.stubGlobal("requestAnimationFrame", undefined);
  let resize!: () => void;
  const observe = vi.fn();
  const disconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  cleanups.push(() => {
    vi.unstubAllGlobals();
  });
  const saved = document.documentElement.style.cssText;
  document.documentElement.style.setProperty("--color-test", "original");
  document.documentElement.style.setProperty(
    "color-scheme",
    "light",
    "important",
  );
  const cleanup = presentation(x.client, window, true, true);
  cleanups.push(() => {
    cleanup();
    document.documentElement.style.cssText = saved;
  });
  x.initialize({
    hostContext: {
      theme: "dark",
      styles: {
        variables: { "--color-test": "host", bad: "ignored" },
        css: { fonts: "p { font-family: sans-serif }" },
      },
    },
  });
  await x.started;
  expect(document.documentElement.style.getPropertyValue("--color-test")).toBe(
    "host",
  );
  expect(document.documentElement.style.colorScheme).toBe("dark");
  expect(document.head.querySelector("style")?.textContent).toContain(
    "font-family",
  );
  expect(observe).toHaveBeenCalledTimes(2);
  resize();
  expect(
    x.messages().filter((m) => m.method === "ui/notifications/size-changed"),
  ).toHaveLength(1);
  x.notify("ui/notifications/host-context-changed", { styles: {} });
  expect(document.documentElement.style.getPropertyValue("--color-test")).toBe(
    "original",
  );
  x.client.close();
  expect(disconnect).toHaveBeenCalled();
  expect(document.head.querySelector("style")).toBeNull();
  expect(
    document.documentElement.style.getPropertyPriority("color-scheme"),
  ).toBe("important");
});

it("can disable presentation and supports scheduled size observation", async () => {
  const x = connection();
  cleanups.push(x.cleanup);
  const disabled = presentation(x.client, window, false, false);
  cleanups.push(disabled);
  x.initialize({ hostContext: { theme: "dark" } });
  await x.started;
  expect(document.documentElement.style.colorScheme).not.toBe("dark");
  const callbacks: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  const cancel = vi.fn();
  vi.stubGlobal("cancelAnimationFrame", cancel);
  let resize!: () => void;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  cleanups.push(() => {
    vi.unstubAllGlobals();
  });
  const cleanup = presentation(x.client, window, false, true);
  cleanups.push(cleanup);
  vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(
    1000,
  );
  const bounds = vi
    .spyOn(document.documentElement, "getBoundingClientRect")
    .mockReturnValue({ height: 100 } as DOMRect);
  resize();
  expect(callbacks).toHaveLength(1);
  required(callbacks[0])(0);
  expect(x.messages().at(-1)?.params).toMatchObject({ height: 100 });
  bounds.mockReturnValue({ height: 50 } as DOMRect);
  resize();
  required(callbacks[1])(0);
  expect(x.messages().at(-1)?.params).toMatchObject({ height: 50 });
  resize();
  cleanup();
  expect(cancel).toHaveBeenCalled();
});
