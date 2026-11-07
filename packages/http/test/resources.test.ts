import {
  AuthError,
  createAuthAccessor,
  createServer,
  resource,
  type ToolContext,
} from "@toolgrain/mcp";
import {
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";
import { expect, it, vi } from "vitest";
import { createHttpHandler } from "../src/index.js";

const uri = "docs://guide";
function request(
  revision: SupportedProtocolVersion,
  method = "resources/read",
  token = "alice",
  signal?: AbortSignal,
) {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": revision,
      "Mcp-Method": method,
      ...(method === "resources/read" ? { "Mcp-Name": uri } : {}),
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: {
        ...(method === "resources/read" ? { uri } : {}),
        ...(revision === PROTOCOL_VERSION
          ? {
              _meta: {
                "io.modelcontextprotocol/protocolVersion": revision,
                "io.modelcontextprotocol/clientCapabilities": {},
              },
            }
          : {}),
      },
    }),
    ...(signal ? { signal } : {}),
  });
}

it.each([PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const)(
  "authenticates %s resource reads before body parsing and isolates caller identities",
  async (revision) => {
    const type = Symbol("resource-http/auth");
    const useAuth = createAuthAccessor<{ userId: string }>(type);
    const read = vi.fn((uri: string, ctx: ToolContext) => ({
      contents: [{ uri, text: useAuth(ctx).userId }],
    }));
    const server = createServer({
      name: "resources",
      version: "1",
      tools: {},
      resources: [resource({ uri, name: "guide", read })],
      auth: {
        type,
        authorizationServers: ["https://auth.example.com"],
        async verify(token) {
          if (token === "invalid") throw new AuthError("invalid_token");
          return { userId: token };
        },
      },
    });
    const handle = createHttpHandler(server);
    try {
      const unauthorized = new Request(
        request(revision, "resources/read", "invalid"),
        { body: "{" },
      );
      expect((await handle(unauthorized)).status).toBe(401);
      expect(read).not.toHaveBeenCalled();
      const listed = await handle(request(revision, "resources/list"));
      expect(listed.status).toBe(200);
      expect(await listed.json()).toMatchObject({
        result: { resources: [{ uri }] },
      });
      expect(read).not.toHaveBeenCalled();
      const responses = await Promise.all(
        ["alice", "bob"].map((token) =>
          handle(request(revision, "resources/read", token)),
        ),
      );
      for (const response of responses) expect(response.status).toBe(200);
      const bodies = await Promise.all(
        responses.map((response) => response.json()),
      );
      expect(bodies.map((body) => body.result.contents[0].text)).toEqual([
        "alice",
        "bob",
      ]);
      expect(read.mock.calls[0]?.[1]).not.toBe(read.mock.calls[1]?.[1]);
    } finally {
      await server.close();
    }
  },
);

it("validates modern resource routing headers and accepts an encoded matching URI", async () => {
  const read = vi.fn((uri: string) => ({ contents: [{ uri, text: "Guide" }] }));
  const server = createServer({
    name: "resources",
    version: "1",
    tools: {},
    resources: [resource({ uri, name: "guide", read })],
  });
  const handle = createHttpHandler(server);
  try {
    for (const name of [null, "docs://different"]) {
      const incoming = request(PROTOCOL_VERSION);
      if (name === null) incoming.headers.delete("Mcp-Name");
      else incoming.headers.set("Mcp-Name", name);
      expect((await handle(incoming)).status).toBe(400);
    }
    expect(read).not.toHaveBeenCalled();
    const encoded = request(PROTOCOL_VERSION);
    encoded.headers.set("Mcp-Name", `=?base64?${btoa(uri)}?=`);
    const response = await handle(encoded);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      result: { contents: [{ uri, text: "Guide" }] },
    });
    expect(read).toHaveBeenCalledOnce();
  } finally {
    await server.close();
  }
});

it.each([PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const)(
  "aborts a disconnected %s resource reader and suppresses its late failure",
  async (revision) => {
    let reject!: (error: unknown) => void;
    let start!: () => void;
    let ctx: ToolContext | undefined;
    const started = new Promise<void>((resolve) => {
      start = resolve;
    });
    const pending = new Promise<never>((_resolve, fail) => {
      reject = fail;
    });
    const onError = vi.fn();
    const server = createServer({
      name: "resources",
      version: "1",
      tools: {},
      onError,
      resources: [
        resource({
          uri,
          name: "guide",
          read(_uri, context) {
            ctx = context;
            start();
            return pending;
          },
        }),
      ],
    });
    const handle = createHttpHandler(server);
    const controller = new AbortController();
    const reading = handle(
      request(revision, "resources/read", "alice", controller.signal),
    );
    await started;
    controller.abort();
    reject(new Error("private late resource failure"));
    try {
      await expect(reading).rejects.toThrow("aborted");
      expect(ctx?.signal.aborted).toBe(true);
      expect(onError).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  },
);
