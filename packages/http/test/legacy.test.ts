import { tool } from "@toolgrain/core";
import { createServer } from "@toolgrain/mcp";
import {
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@toolgrain/protocol";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createHttpHandler } from "../src/index.js";

const meta = {
  "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
  "io.modelcontextprotocol/clientCapabilities": {},
};
const initialize = {
  protocolVersion: LEGACY_PROTOCOL_VERSION,
  clientInfo: { name: "legacy-client", version: "1" },
  capabilities: {},
};
const rpc = (method: string, params?: unknown) => ({
  jsonrpc: "2.0",
  id: 1,
  method,
  ...(params === undefined ? {} : { params }),
});
function request(
  body: unknown,
  headers: Record<string, string> = {},
  initial = false,
) {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(initial ? {} : { "MCP-Protocol-Version": LEGACY_PROTOCOL_VERSION }),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
function setup(options = {}) {
  const server = createServer({
    name: "legacy-test",
    version: "1",
    instructions: "Test instructions",
    tools: {
      greet: tool({
        input: z.object({ name: z.string().min(1) }),
        execute: ({ name }) => ({ message: `Hello ${name}` }),
      }),
    },
  });
  return { server, handle: createHttpHandler(server, options) };
}

describe("initialization-based HTTP", () => {
  it("initializes, lists, calls, validates, and pings without modern metadata or headers", async () => {
    const { handle } = setup();
    const initialized = await handle(
      request(rpc("initialize", initialize), {}, true),
    );
    expect(initialized.status).toBe(200);
    expect(initialized.headers.has("Mcp-Session-Id")).toBe(false);
    expect(await initialized.json()).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: LEGACY_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "legacy-test", version: "1" },
        instructions: "Test instructions",
      },
    });
    const notification = await handle(
      request({ jsonrpc: "2.0", method: "notifications/initialized" }),
    );
    expect(notification.status).toBe(202);
    expect(await notification.text()).toBe("");
    const listed = await handle(request(rpc("tools/list")));
    expect(listed.status).toBe(200);
    const result = (await listed.json()).result;
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]).toMatchObject({
      name: "greet",
      inputSchema: { type: "object" },
    });
    expect(result).not.toHaveProperty("ttlMs");
    expect(result).not.toHaveProperty("cacheScope");
    const called = await handle(
      request(rpc("tools/call", { name: "greet", arguments: { name: "Ada" } })),
    );
    expect(called.status).toBe(200);
    expect((await called.json()).result).toMatchObject({
      content: [{ type: "text", text: '{"message":"Hello Ada"}' }],
      structuredContent: { message: "Hello Ada" },
    });
    const invalid = await handle(
      request(rpc("tools/call", { name: "greet", arguments: {} })),
    );
    expect(invalid.status).toBe(200);
    expect((await invalid.json()).result.isError).toBe(true);
    const pinged = await handle(request(rpc("ping")));
    expect(pinged.status).toBe(200);
    expect(await pinged.json()).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
  });

  it("negotiates an unsupported initialization proposal but rejects unsupported HTTP version headers", async () => {
    const { handle } = setup();
    for (const version of ["2025-03-26", "2025-11-25", PROTOCOL_VERSION]) {
      const response = await handle(
        request(
          rpc("initialize", { ...initialize, protocolVersion: version }),
          {},
          true,
        ),
      );
      expect(response.status).toBe(200);
      expect((await response.json()).result.protocolVersion).toBe(
        LEGACY_PROTOCOL_VERSION,
      );
      const unsupported = await handle(
        request(rpc("initialize", initialize), {
          "MCP-Protocol-Version":
            version === PROTOCOL_VERSION ? "future" : version,
        }),
      );
      expect(unsupported.status).toBe(400);
      expect((await unsupported.json()).error.data.supported).toEqual(
        SUPPORTED_PROTOCOL_VERSIONS,
      );
    }
  });

  it("requires the negotiated version header on every subsequent POST", async () => {
    const { handle } = setup();
    await handle(request(rpc("initialize", initialize), {}, true));
    for (const body of [
      rpc("tools/list"),
      { jsonrpc: "2.0", method: "notifications/initialized" },
    ])
      expect((await handle(request(body, {}, true))).status).toBe(400);
    const modernClaim = request(
      rpc("initialize", { ...initialize, _meta: meta }),
      {},
      true,
    );
    expect((await handle(modernClaim)).status).toBe(400);
  });

  it("keeps JSON-RPC request errors in HTTP200 responses", async () => {
    const { handle } = setup();
    for (const [body, code] of [
      [rpc("unknown"), -32601],
      [rpc("tools/call", { name: "missing", arguments: {} }), -32602],
      [rpc("tools/list", { cursor: "next" }), -32602],
      [rpc("initialize", {}), -32602],
    ] as const) {
      const response = await handle(request(body));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ id: 1, error: { code } });
    }
  });

  it("accepts valid notifications, and rejects malformed, unsupported notifications and response envelopes", async () => {
    const { handle } = setup();
    for (const [method, params] of [
      ["notifications/initialized", {}],
      ["notifications/initialized", { _meta: { custom: true } }],
      ["notifications/cancelled", { requestId: 1 }],
      [
        "notifications/cancelled",
        { requestId: "one", reason: "done", _meta: {} },
      ],
    ]) {
      const response = await handle(
        request({ jsonrpc: "2.0", method, params }),
      );
      expect(response.status).toBe(202);
      expect(await response.text()).toBe("");
    }
    for (const body of [
      { jsonrpc: "2.0", method: "notifications/initialized", params: [] },
      {
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: { _meta: null },
      },
      { jsonrpc: "2.0", method: "notifications/cancelled" },
      ...[null, false, 1.5].map((requestId) => ({
        jsonrpc: "2.0",
        method: "notifications/cancelled",
        params: { requestId },
      })),
      {
        jsonrpc: "2.0",
        method: "notifications/cancelled",
        params: { requestId: 1, reason: {} },
      },
      { jsonrpc: "2.0", method: "notifications/unknown" },
      { jsonrpc: "2.0", method: "notifications/initialized", result: {} },
      { jsonrpc: "2.0", method: "notifications/initialized", error: {} },
      { jsonrpc: "2.0", id: 1, result: {} },
      { ...rpc("tools/list"), result: {} },
      { ...rpc("tools/list"), error: {} },
      { ...rpc("tools/list"), id: 1.5 },
      rpc("tools/list", []),
    ]) {
      const response = await handle(request(body));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: -32600 } });
    }
  });

  it("validates optional routing headers without requiring modern mirroring", async () => {
    const { handle } = setup();
    const body = rpc("tools/call", {
      name: "greet",
      arguments: { name: "Ada" },
    });
    expect(
      (
        await handle(
          request(body, {
            "Mcp-Method": "tools/call",
            "Mcp-Name": "=?base64?Z3JlZXQ=?=",
          }),
        )
      ).status,
    ).toBe(200);
    for (const headers of [
      { "Mcp-Method": "ping" },
      { "Mcp-Name": "other" },
      { "Mcp-Name": "=?base64?!!!?=" },
    ])
      expect((await handle(request(body, headers))).status).toBe(400);
    const extensions = rpc("tools/list", {
      _meta: {
        "io.modelcontextprotocol/clientCapabilities": {},
        "io.modelcontextprotocol/clientInfo": { name: "custom" },
      },
    });
    expect((await handle(request(extensions))).status).toBe(200);
    expect(
      (
        await handle(
          request(
            rpc("tools/list", {
              _meta: {
                "io.modelcontextprotocol/protocolVersion":
                  LEGACY_PROTOCOL_VERSION,
              },
            }),
          ),
        )
      ).status,
    ).toBe(200);
    expect(
      (await handle(request(rpc("tools/list", { _meta: meta })))).status,
    ).toBe(400);
    const initial = request(
      rpc("initialize", initialize),
      { "Mcp-Method": "initialize" },
      true,
    );
    expect((await handle(initial)).status).toBe(200);
  });

  it("validates optional parameter headers when supplied while legacy clients need not mirror them", async () => {
    const server = createServer({
      name: "headers",
      version: "1",
      tools: {
        greet: tool({
          input: z.object({
            name: z.string().meta({ "x-mcp-header": "Name" }),
            count: z
              .number()
              .int()
              .optional()
              .meta({ "x-mcp-header": "Count" }),
          }),
          execute: () => "ok",
        }),
      },
    });
    const handle = createHttpHandler(server);
    const body = rpc("tools/call", {
      name: "greet",
      arguments: { name: "Ada", count: 1 },
    });
    for (const headers of [
      {},
      { "Mcp-Param-Name": "Ada", "Mcp-Param-Count": "1" },
    ])
      expect((await handle(request(body, headers))).status).toBe(200);
    for (const headers of [
      { "Mcp-Param-Name": "wrong" },
      { "Mcp-Param-Count": "2" },
    ])
      expect((await handle(request(body, headers))).status).toBe(400);
    expect(
      (
        await handle(
          request(
            rpc("tools/call", { name: "greet", arguments: { name: "Ada" } }),
            { "Mcp-Param-Count": "1" },
          ),
        )
      ).status,
    ).toBe(400);
  });

  it("keeps common origin, negotiation and body protection for legacy POSTs", async () => {
    const { handle } = setup();
    for (const [headers, status] of [
      [{ Origin: "https://untrusted.example" }, 403],
      [{ Accept: "application/json" }, 406],
      [{ "Content-Type": "text/plain" }, 415],
    ] as const)
      expect(
        (await handle(request(rpc("initialize", initialize), headers, true)))
          .status,
      ).toBe(status);
    const malformed = request(rpc("tools/list"));
    const response = await handle(
      new Request(malformed.url, {
        method: "POST",
        headers: malformed.headers,
        body: "{",
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
    const oversized = await setup({ maxMessageBytes: 1 }).handle(
      request(rpc("tools/list")),
    );
    expect(oversized.status).toBe(413);
    expect((await oversized.json()).id).toBeNull();
    const invalid = await handle(request(null));
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).id).toBeNull();
  });

  it("reports unavailable servers for legacy requests and notifications", async () => {
    const { server, handle } = setup();
    await server.close();
    for (const body of [
      rpc("tools/list"),
      { jsonrpc: "2.0", method: "notifications/initialized" },
    ])
      expect((await handle(request(body))).status).toBe(503);
  });

  it("keeps concurrent eras and request IDs independent and cancellation notifications advisory", async () => {
    let finish = () => {};
    let started = () => {};
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const running = new Promise<void>((resolve) => {
      started = resolve;
    });
    const server = createServer({
      name: "mixed",
      version: "1",
      tools: {
        greet: tool({
          input: z.object({ name: z.string() }),
          async execute({ name }) {
            if (name === "slow") {
              started();
              await waiting;
            }
            return name;
          },
        }),
      },
    });
    const handle = createHttpHandler(server);
    const slow = handle(
      request(
        rpc("tools/call", { name: "greet", arguments: { name: "slow" } }),
      ),
    );
    await running;
    const cancellation = await handle(
      request({
        jsonrpc: "2.0",
        method: "notifications/cancelled",
        params: { requestId: 1 },
      }),
    );
    expect(cancellation.status).toBe(202);
    const modern = await handle(
      request(
        rpc("tools/call", {
          _meta: meta,
          name: "greet",
          arguments: { name: "fast" },
        }),
        {
          "MCP-Protocol-Version": PROTOCOL_VERSION,
          "Mcp-Method": "tools/call",
          "Mcp-Name": "greet",
        },
      ),
    );
    expect(modern.status).toBe(200);
    expect((await modern.json()).result.content[0].text).toBe("fast");
    finish();
    expect((await (await slow).json()).result.content[0].text).toBe("slow");
    const [legacyList, modernList] = await Promise.all([
      handle(request(rpc("tools/list"))),
      handle(
        request(rpc("tools/list", { _meta: meta }), {
          "MCP-Protocol-Version": PROTOCOL_VERSION,
          "Mcp-Method": "tools/list",
        }),
      ),
    ]);
    expect((await legacyList.json()).result).not.toHaveProperty("ttlMs");
    expect((await modernList.json()).result.ttlMs).toBe(0);
    await server.close();
  });
});
