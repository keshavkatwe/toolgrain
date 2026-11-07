import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createServer, resource, tool } from "@toolgrain/mcp";
import { JSDOM, VirtualConsole } from "jsdom";

const { tools } = await import(
  new URL("../../../apps/react-apps-example/src/tools.ts", import.meta.url)
);
const temporary = await mkdtemp(join(tmpdir(), "toolgrain-apps-sdk-"));
await writeFile(
  join(temporary, "package.json"),
  JSON.stringify({
    private: true,
    type: "module",
    dependencies: {
      "@modelcontextprotocol/ext-apps": "2.0.4",
      "@modelcontextprotocol/client": "2.0.0",
      zod: "4.6.7",
    },
  }),
);
try {
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
    { cwd: temporary, stdio: "inherit", timeout: 120_000 },
  );
  await writeFile(
    join(temporary, "widget.mjs"),
    await readFile(new URL("./sdk-widget.mjs", import.meta.url)),
  );
  execFileSync(
    "bun",
    [
      "build",
      "--target=browser",
      "--minify",
      `--outfile=${join(temporary, "widget.js")}`,
      join(temporary, "widget.mjs"),
    ],
    { stdio: "inherit", timeout: 30_000 },
  );
  const html =
    "<!doctype html><html><body><script>" +
    (await readFile(join(temporary, "widget.js"), "utf8")).replaceAll(
      "</script",
      "<\\/script",
    ) +
    "</script></body></html>";
  const server = createServer({
    name: "interop",
    version: "1",
    tools: {
      weather: tool({
        ...tools.weather,
        _meta: { ui: { resourceUri: "ui://interop/widget.html" } },
      }),
    },
    resources: [
      resource({
        uri: "ui://interop/widget.html",
        name: "sdk-widget",
        mimeType: "text/html;profile=mcp-app",
        read: (uri) => ({
          contents: [
            {
              uri,
              mimeType: "text/html;profile=mcp-app",
              text: html,
              _meta: {
                ui: { csp: { resourceDomains: [], connectDomains: [] } },
              },
            },
          ],
        }),
      }),
    ],
  });
  const meta = {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientCapabilities": {
      extensions: {
        "io.modelcontextprotocol/ui": {
          mimeTypes: ["text/html;profile=mcp-app"],
        },
      },
    },
  };
  let id = 0;
  const dispatch = (method, params) =>
    server.handle({
      jsonrpc: "2.0",
      id: ++id,
      method,
      params: { ...params, _meta: meta },
    });
  const toolList = await dispatch("tools/list", {});
  const uri = toolList.result.tools[0]._meta.ui.resourceUri;
  assert.equal(uri, "ui://interop/widget.html");
  const resourceReply = await dispatch("resources/read", { uri });
  assert.equal(
    resourceReply.result.contents[0].mimeType,
    "text/html;profile=mcp-app",
  );
  assert.deepEqual(
    resourceReply.result.contents[0]._meta.ui.csp.connectDomains,
    [],
  );
  let widget;
  const messages = [];
  const emit = (data) =>
    widget.dispatchEvent(
      new widget.MessageEvent("message", {
        source: parent,
        data: structuredClone(data),
      }),
    );
  const parent = {
    postMessage(message) {
      message = structuredClone(message);
      messages.push(message);
      queueMicrotask(async () => {
        if (message.method === "ui/initialize")
          emit({
            jsonrpc: "2.0",
            id: message.id,
            result: {
              protocolVersion: "2026-01-26",
              hostInfo: {
                name: "Toolgrain interoperability fixture",
                version: "1",
              },
              hostCapabilities: { serverTools: {} },
              hostContext: { theme: "light" },
            },
          });
        if (message.method === "tools/call") {
          const response = await dispatch("tools/call", message.params);
          emit({ jsonrpc: "2.0", id: message.id, result: response.result });
        }
      });
    },
  };
  const dom = new JSDOM(resourceReply.result.contents[0].text, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
    url: "https://widget.example",
    beforeParse(window) {
      widget = window;
      Object.defineProperty(window, "parent", { value: parent });
      window.TextEncoder = TextEncoder;
      window.TextDecoder = TextDecoder;
    },
  });
  try {
    for (
      let i = 0;
      i < 100 && widget.document.body.dataset.connected !== "yes";
      i++
    )
      await delay(10);
    assert.equal(widget.document.body.dataset.error, undefined);
    assert.equal(widget.document.body.dataset.connected, "yes");
    assert(
      messages.some(
        (message) => message.method === "ui/notifications/initialized",
      ),
    );
    const initial = await dispatch("tools/call", {
      name: "weather",
      arguments: { city: "Dubai" },
    });
    emit({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-input",
      params: { arguments: { city: "Dubai" } },
    });
    emit({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: initial.result,
    });
    await delay(0);
    assert.equal(
      JSON.parse(widget.document.body.dataset.initial).structuredContent.city,
      "Dubai",
    );
    assert.equal(
      JSON.parse(widget.document.body.dataset.initial)._meta.view,
      "weather",
    );
    const updated = await widget.callFromWidget();
    assert.equal(updated.structuredContent.city, "London");
    emit({
      jsonrpc: "2.0",
      method: "ui/notifications/host-context-changed",
      params: { theme: "dark" },
    });
    await delay(0);
    assert.equal(widget.document.body.dataset.theme, "dark");
    const report = {
      status: "passed",
      date: new Date().toISOString().slice(0, 10),
      widget: "Independently authored official SDK 2.0.4 widget",
      host: "Self-authored DOM protocol fixture, not Claude Desktop",
      outerProtocol: "2026-07-28",
      appsProtocol: "2026-01-26",
      checks: [
        "Toolgrain resource read and CSP metadata",
        "Apps handshake",
        "Initial structured content and metadata delivery",
        "Host-mediated tool call",
        "Theme change",
      ],
    };
    const reports = new URL("../../../reports/", import.meta.url);
    await mkdir(reports, { recursive: true });
    await writeFile(
      new URL("apps-sdk-interoperability.json", reports),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
    await widget.disposeWidget();
  } finally {
    dom.window.close();
    await server.close();
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
