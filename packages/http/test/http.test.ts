import { tool } from "@toolgrain/core";
import { createServer } from "@toolgrain/mcp";
import { PROTOCOL_VERSION } from "@toolgrain/protocol";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createHttpHandler } from "../src/index.js";

const meta = {
  "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
  "io.modelcontextprotocol/clientCapabilities": {},
};
function setup(options = {}) {
  const server = createServer({
    name: "test",
    version: "1",
    tools: {
      greet: tool({
        input: z.object({ name: z.string() }),
        execute: ({ name }) => `Hello ${name}`,
      }),
    },
  });
  return { server, handle: createHttpHandler(server, options) };
}
function request(
  method = "tools/list",
  params: Record<string, unknown> = {},
  headers: Record<string, string> = {},
  body?: string,
) {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL_VERSION,
      "Mcp-Method": method,
      ...(params.name ? { "Mcp-Name": String(params.name) } : {}),
      ...headers,
    },
    body:
      body ??
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params: { _meta: meta, ...params },
      }),
  });
}
describe("HTTP", () => {
  it("discovers, lists and calls tools", async () => {
    const { handle } = setup();
    for (const method of ["server/discover", "tools/list", "tools/call"]) {
      const response = await handle(
        request(
          method,
          method === "tools/call"
            ? { name: "greet", arguments: { name: "Ada" } }
            : {},
        ),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toHaveProperty("result");
    }
  });
  it.each(["GET", "DELETE", "PUT", "OPTIONS"])("rejects %s", async (method) => {
    const response = await setup().handle(
      new Request("http://localhost/mcp", { method }),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });
  it("checks origins and snapshots options", async () => {
    const allowedOrigins = ["https://example.com"];
    const { handle } = setup({ allowedOrigins });
    allowedOrigins.push("https://evil.com");
    expect(
      (
        await handle(
          request("tools/list", {}, { Origin: "https://example.com" }),
        )
      ).status,
    ).toBe(200);
    for (const origin of ["null", "https://evil.com"])
      expect(
        (await handle(request("tools/list", {}, { Origin: origin }))).status,
      ).toBe(403);
    expect(() =>
      setup({ allowedOrigins: ["https://example.com/path"] }),
    ).toThrow();
    expect(() => setup({ maxMessageBytes: 0 })).toThrow();
  });
  it("validates content negotiation", async () => {
    expect(
      (
        await setup().handle(
          request("tools/list", {}, { "Content-Type": "text/plain" }),
        )
      ).status,
    ).toBe(415);
    for (const Accept of [
      "",
      "application/json",
      "application/json, text/event-stream;q=0",
    ])
      expect(
        (await setup().handle(request("tools/list", {}, { Accept }))).status,
      ).toBe(406);
  });
  it("rejects malformed, missing, oversized and invalid UTF-8 bodies", async () => {
    const { handle } = setup();
    for (const body of [
      "{",
      "[]",
      "null",
      "{}",
      JSON.stringify({ jsonrpc: "2.0", id: null, method: "tools/list" }),
    ])
      expect((await handle(request("tools/list", {}, {}, body))).status).toBe(
        400,
      );
    expect((await setup({ maxMessageBytes: 2 }).handle(request())).status).toBe(
      413,
    );
    const empty = request();
    const init = { method: "POST", headers: empty.headers };
    expect((await handle(new Request(empty.url, init))).status).toBe(400);
    expect(
      (
        await handle(
          new Request(empty.url, { ...init, body: new Uint8Array([255]) }),
        )
      ).status,
    ).toBe(400);
  });
  it("rejects missing, mismatched and malformed headers", async () => {
    const { handle } = setup();
    for (const headers of [
      { "Mcp-Method": "wrong" },
      { "MCP-Protocol-Version": "bad" },
      { "Mcp-Name": "wrong" },
      { "Mcp-Name": "=?base64?!!!?=" },
      { "Mcp-Name": "=?base64?/w==?=" },
    ]) {
      const response = await handle(
        request(
          "tools/call",
          { name: "greet", arguments: { name: "Ada" } },
          headers,
        ),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe(-32020);
    }
    const missing = request();
    missing.headers.delete("Mcp-Method");
    expect((await handle(missing)).status).toBe(400);
    const missingName = request("tools/call", { name: "greet" });
    missingName.headers.delete("Mcp-Name");
    expect((await handle(missingName)).status).toBe(400);
  });
  it("supports encoded names and rejects unsupported versions and methods", async () => {
    const { handle } = setup();
    expect(
      (
        await handle(
          request(
            "tools/call",
            { name: "greet", arguments: { name: "Ada" } },
            { "Mcp-Name": "=?base64?Z3JlZXQ=?=" },
          ),
        )
      ).status,
    ).toBe(200);
    expect((await handle(request("unknown"))).status).toBe(404);
    const response = await handle(
      request(
        "tools/list",
        {
          _meta: { ...meta, "io.modelcontextprotocol/protocolVersion": "old" },
        },
        { "MCP-Protocol-Version": "old" },
      ),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.data.supported).toEqual([
      PROTOCOL_VERSION,
    ]);
  });
  it("rejects notifications without cancelling other requests and reports unavailable servers", async () => {
    const { server, handle } = setup();
    expect(
      (
        await handle(
          request(
            "notifications/cancelled",
            {},
            {},
            JSON.stringify({
              jsonrpc: "2.0",
              method: "notifications/cancelled",
              params: { requestId: 1 },
            }),
          ),
        )
      ).status,
    ).toBe(400);
    await server.close();
    expect((await handle(request())).status).toBe(503);
  });
  it("does not share request IDs between clients", async () => {
    const { handle } = setup();
    const responses = await Promise.all([handle(request()), handle(request())]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
  });
});
it("validates resources and prompts names before reporting method not found", async () => {
  const { handle } = setup();
  for (const method of ["resources/read", "prompts/get"]) {
    const params =
      method === "resources/read" ? { uri: "file:///a" } : { name: "greet" };
    expect(
      (
        await handle(
          request(method, params, {
            "Mcp-Name": method === "resources/read" ? "file:///a" : "greet",
          }),
        )
      ).status,
    ).toBe(404);
  }
});
it("reports input errors and ignores old session headers", async () => {
  const { handle } = setup();
  expect((await handle(request("tools/list", { _meta: {} }))).status).toBe(400);
  const response = await handle(
    request(
      "tools/call",
      { name: "greet", arguments: {} },
      { "Mcp-Session-Id": "old", "Last-Event-ID": "old" },
    ),
  );
  expect(response.status).toBe(200);
  expect((await response.json()).result.isError).toBe(true);
  expect(response.headers.has("Mcp-Session-Id")).toBe(false);
});
it("propagates aborted reads and suppresses aborted results", async () => {
  const { handle } = setup();
  const controller = new AbortController();
  const base = request();
  const req = new Request(base, { signal: controller.signal });
  controller.abort();
  await expect(handle(req)).rejects.toThrow();
  const broken = new Request(base.url, {
    method: "POST",
    headers: base.headers,
    body: new ReadableStream({
      start(c) {
        c.error(new Error("broken"));
      },
    }),
    duplex: "half",
  } as RequestInit);
  expect((await handle(broken)).status).toBe(400);
});
it("supports custom headers on advertised schemas", async () => {
  const input = z.object({ name: z.string().meta({ "x-mcp-header": "Name" }) });
  const server = createServer({
    name: "test",
    version: "1",
    tools: { greet: tool({ input, execute: () => "ok" }) },
  });
  const handle = createHttpHandler(server);
  expect(
    (
      await handle(
        request("tools/call", { name: "greet", arguments: { name: "Ada" } }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await handle(
        request(
          "tools/call",
          { name: "greet", arguments: { name: "Ada" } },
          { "Mcp-Param-Name": "Ada" },
        ),
      )
    ).status,
  ).toBe(200);
});
it("handles unavailable responses and cancellation races", async () => {
  const { server } = setup();
  const empty = createHttpHandler({ ...server, handle: async () => undefined });
  expect((await empty(request())).status).toBe(503);
  const controller = new AbortController();
  const aborted = createHttpHandler({
    ...server,
    handle: async () => {
      controller.abort();
      return undefined;
    },
  });
  await expect(
    aborted(new Request(request(), { signal: controller.signal })),
  ).rejects.toThrow("aborted");
});
it("maps protocol errors and preserves request-local failures", async () => {
  const { server } = setup();
  for (const code of [-32600, -32602, -32021, -32022, -32603]) {
    const handle = createHttpHandler({
      ...server,
      handle: async () => ({
        jsonrpc: "2.0",
        id: 1,
        error: { code, message: "test" },
      }),
    });
    expect((await handle(request())).status).toBe(code === -32603 ? 200 : 400);
  }
});
it("rejects already consumed bodies and non-finite request IDs", async () => {
  const { handle } = setup();
  const consumed = request();
  await consumed.text();
  expect((await handle(consumed)).status).toBe(400);
  expect(
    (
      await handle(
        request(
          "tools/list",
          {},
          {},
          '{"jsonrpc":"2.0","id":1e999,"method":"tools/list"}',
        ),
      )
    ).status,
  ).toBe(400);
});
it("cancels only the disconnected request while another client uses the same ID", async () => {
  let finish: () => void = () => {};
  let started: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const running = new Promise<void>((resolve) => {
    started = resolve;
  });
  const server = createServer({
    name: "test",
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
  const controller = new AbortController();
  const slow = handle(
    new Request(
      request("tools/call", { name: "greet", arguments: { name: "slow" } }),
      { signal: controller.signal },
    ),
  );
  await running;
  controller.abort();
  const fast = await handle(
    request("tools/call", { name: "greet", arguments: { name: "fast" } }),
  );
  expect(fast.status).toBe(200);
  expect((await fast.json()).result.content[0].text).toBe("fast");
  finish();
  await expect(slow).rejects.toThrow("aborted");
  await server.close();
});

it("settles a stalled body read when the request is aborted", async () => {
  const controller = new AbortController();
  const base = request();
  const pending = setup().handle(
    new Request(base.url, {
      method: "POST",
      headers: base.headers,
      signal: controller.signal,
      body: new ReadableStream(),
      duplex: "half",
    } as RequestInit),
  );
  controller.abort();
  await expect(pending).rejects.toThrow();
});
it("returns a size error without waiting for upstream cancellation", async () => {
  const base = request();
  const response = await setup({ maxMessageBytes: 1 }).handle(
    new Request(base.url, {
      method: "POST",
      headers: base.headers,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]));
        },
        cancel() {
          return new Promise(() => {});
        },
      }),
      duplex: "half",
    } as RequestInit),
  );
  expect(response.status).toBe(413);
});
