import { LEGACY_PROTOCOL_VERSION, PROTOCOL_VERSION } from "@toolgrain/protocol";
import { APPS_EXTENSION_ID, APPS_MIME_TYPE } from "@toolgrain/protocol/apps";
import { expect, it } from "vitest";
import { z } from "zod";
import {
  createServer,
  getAppSupport,
  mcpResult,
  resource,
  tool,
  toolContext,
} from "../src/index.js";

it("reads only the current client's advisory capability claim", () => {
  expect(getAppSupport(toolContext())).toBe("unknown");
  for (const capabilities of [
    {},
    { extensions: {} },
    { extensions: { [APPS_EXTENSION_ID]: {} } },
    { extensions: { [APPS_EXTENSION_ID]: { mimeTypes: ["text/html"] } } },
  ]) {
    expect(
      getAppSupport(toolContext({ request: { client: { capabilities } } })),
    ).toBe("not-advertised");
  }
  expect(
    getAppSupport(
      toolContext({
        request: {
          client: {
            capabilities: {
              extensions: {
                [APPS_EXTENSION_ID]: { mimeTypes: [APPS_MIME_TYPE] },
              },
            },
          },
        },
      }),
    ),
  ).toBe("supported");
});
it("retains result metadata inference without changing the envelope", () => {
  const result = mcpResult({
    content: [],
    structuredContent: { value: 1 },
    _meta: { view: "chart" },
  });
  const view: "chart" | undefined = result.value._meta?.view;
  expect(view).toBe("chart");
});

it.each([PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const)(
  "combines Apps resources and rich results with progress for %s",
  async (protocolVersion) => {
    const updates: unknown[] = [];
    const meta =
      protocolVersion === PROTOCOL_VERSION
        ? {
            "io.modelcontextprotocol/protocolVersion": protocolVersion,
            "io.modelcontextprotocol/clientCapabilities": {
              extensions: {
                [APPS_EXTENSION_ID]: { mimeTypes: [APPS_MIME_TYPE] },
              },
            },
          }
        : {};
    const server = createServer({
      name: "combined-apps-progress",
      version: "1",
      tools: {
        weather: tool({
          input: z.object({}),
          output: z.object({ temperature: z.number() }),
          _meta: { ui: { resourceUri: "ui://combined/widget.html" } },
          async execute(_input, ctx) {
            await ctx.reportProgress({ progress: 1, total: 1 });
            return mcpResult({
              content: [{ type: "text", text: "Dubai: 29°C" }],
              structuredContent: { temperature: 29 },
              _meta: { view: "weather" },
            });
          },
        }),
      },
      resources: [
        resource({
          uri: "ui://combined/widget.html",
          name: "widget",
          mimeType: APPS_MIME_TYPE,
          read: (uri, ctx) => ({
            contents: [
              {
                uri,
                mimeType: APPS_MIME_TYPE,
                text: getAppSupport(ctx),
                _meta: { ui: { csp: { connectDomains: [] } } },
              },
            ],
          }),
        }),
      ],
    });
    try {
      const reply = await server.handle(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "weather",
            _meta: { ...meta, progressToken: "refresh" },
          },
        },
        {
          protocolVersion,
          onNotification: (message) => {
            updates.push(message);
          },
        },
      );
      expect(updates).toMatchObject([
        {
          method: "notifications/progress",
          params: { progressToken: "refresh", progress: 1, total: 1 },
        },
      ]);
      expect(reply).toMatchObject({
        result: {
          _meta: { view: "weather" },
          content: [
            { type: "text", text: "Dubai: 29°C" },
            { type: "text", text: '{"temperature":29}' },
          ],
        },
      });
      const read = await server.handle(
        {
          jsonrpc: "2.0",
          id: 2,
          method: "resources/read",
          params: { uri: "ui://combined/widget.html", _meta: meta },
        },
        { protocolVersion },
      );
      expect(read).toMatchObject({
        result: {
          contents: [
            {
              mimeType: APPS_MIME_TYPE,
              text:
                protocolVersion === PROTOCOL_VERSION ? "supported" : "unknown",
              _meta: { ui: { csp: { connectDomains: [] } } },
            },
          ],
        },
      });
    } finally {
      await server.close();
    }
  },
);
