import {
  createServer as createHttpServer,
  request as sendHttp,
} from "node:http";
import {
  AuthError,
  createAuthAccessor,
  createServer,
  tool,
} from "@toolgrain/mcp";
import { LEGACY_PROTOCOL_VERSION, PROTOCOL_VERSION } from "@toolgrain/protocol";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { http } from "../src/index.js";

function fixture(
  protectedEndpoint = true,
  options: Parameters<typeof http>[0] = {},
) {
  const type = Symbol.for("listener/auth");
  const useAuth = createAuthAccessor<{ userId: string }>(type);
  const verify = vi.fn(async (token: string) => {
    if (token !== "valid") throw new AuthError("invalid_token");
    return { userId: "alice" };
  });
  const server = createServer({
    name: "listener",
    version: "1",
    ...(protectedEndpoint
      ? {
          auth: {
            type,
            authorizationServers: ["https://auth.example.com"],
            verify,
          },
        }
      : {}),
    tools: {
      who: tool({
        input: z.object({}),
        execute(_input, ctx) {
          return protectedEndpoint ? useAuth(ctx).userId : "public";
        },
      }),
    },
  });
  const transport = http({ port: 0, ...options });
  return { server, transport, verify };
}
function request(revision: string, token = "valid") {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": revision,
      "Mcp-Method": "tools/call",
      "Mcp-Name": "who",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "who",
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
  };
}

function rawGet(url: string, headers: Record<string, string>) {
  return new Promise<{ status: number | undefined; body: string }>(
    (resolve, reject) => {
      const req = sendHttp(url, { headers }, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk.toString();
        });
        res.on("end", () => resolve({ status: res.statusCode, body }));
      });
      req.on("error", reject);
      req.end();
    },
  );
}

it.each([true, false])(
  "owns a real HTTP listener with protected=%s and independent requests in both eras",
  async (protectedEndpoint) => {
    const f = fixture(protectedEndpoint);
    expect(f.transport.address()).toBeUndefined();
    await f.server.listen(f.transport);
    try {
      const address = f.transport.address();
      if (!address) throw new Error("Expected listener address");
      const origin = `http://127.0.0.1:${address.port}`;
      address.port = 1;
      expect(f.transport.address()?.port).not.toBe(1);
      const metadata = await fetch(
        `${origin}/.well-known/oauth-protected-resource/mcp`,
      );
      expect(metadata.status).toBe(protectedEndpoint ? 200 : 404);
      if (protectedEndpoint)
        expect(await metadata.json()).toHaveProperty(
          "resource",
          `${origin}/mcp`,
        );
      for (const revision of [PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION]) {
        const results = await Promise.all([
          fetch(`${origin}/mcp`, request(revision)),
          fetch(`${origin}/mcp`, request(revision)),
        ]);
        for (const response of results) {
          expect(response.status).toBe(200);
          expect(await response.json()).toHaveProperty(
            "result.content.0.text",
            protectedEndpoint ? "alice" : "public",
          );
        }
        if (protectedEndpoint) {
          expect(
            (await fetch(`${origin}/mcp`, request(revision, "invalid"))).status,
          ).toBe(401);
          expect(f.verify).toHaveBeenLastCalledWith(
            "invalid",
            expect.objectContaining({ resource: `${origin}/mcp` }),
          );
        }
      }
      expect((await fetch(`${origin}/other`)).status).toBe(404);
      await expect(f.server.listen(http({ port: 0 }))).rejects.toThrow(
        "one transport",
      );
      const closing = f.server.close();
      expect(f.server.close()).toBe(closing);
      await closing;
      expect(f.transport.address()).toBeUndefined();
      await expect(fetch(`${origin}/mcp`)).rejects.toThrow();
      await expect(f.server.listen(http({ port: 0 }))).rejects.toThrow(
        "cannot restart",
      );
    } finally {
      await f.server.close();
    }
  },
);

it("validates the actual listening port and ignores forwarded headers", async () => {
  const f = fixture();
  await f.server.listen(f.transport);
  const port = f.transport.address()?.port;
  const origin = `http://127.0.0.1:${port}`;
  try {
    for (const path of ["/mcp", "/.well-known/oauth-protected-resource/mcp"])
      for (const host of ["evil.example.com", "localhost:1", "127.0.0.1:1"])
        expect(
          await new Promise((resolve, reject) => {
            const req = sendHttp(
              `${origin}${path}`,
              { headers: { Host: host } },
              (res) => {
                res.resume();
                resolve(res.statusCode);
              },
            );
            req.on("error", reject);
            req.end();
          }),
        ).toBe(403);
    const response = await rawGet(
      `${origin}/.well-known/oauth-protected-resource/mcp`,
      {
        Host: `localhost:${port}`,
        "X-Forwarded-Host": "evil.example.com",
        "X-Forwarded-Proto": "https",
      },
    );
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toHaveProperty(
      "resource",
      `http://localhost:${port}/mcp`,
    );
  } finally {
    await f.server.close();
  }
});

it("snapshots custom hosts and routing, and closes a transport directly", async () => {
  const allowedHosts = ["api.example.com"];
  const f = fixture(true, { path: "/public/mcp", allowedHosts });
  allowedHosts.push("evil.example.com");
  await f.server.listen(f.transport);
  const origin = `http://127.0.0.1:${f.transport.address()?.port}`;
  try {
    expect((await fetch(`${origin}/public/mcp`)).status).toBe(403);
    expect(
      (await rawGet(`${origin}/public/mcp`, { Host: "evil.example.com" }))
        .status,
    ).toBe(403);
    expect(
      (await rawGet(`${origin}/public/mcp`, { Host: "api.example.com" }))
        .status,
    ).toBe(405);
    await f.transport.close();
    await expect(f.server.handle({})).rejects.toThrow("closed");
  } finally {
    await f.server.close();
  }
});

it("reports bind errors and releases the transport after startup fails", async () => {
  const occupied = createHttpServer();
  await new Promise<void>((resolve) =>
    occupied.listen(0, "127.0.0.1", resolve),
  );
  const address = occupied.address() as import("node:net").AddressInfo;
  const onError = vi.fn();
  const server = createServer({
    name: "conflict",
    version: "1",
    tools: {},
    onError,
  });
  const transport = http({ port: address.port });
  try {
    await expect(server.listen(transport)).rejects.toHaveProperty(
      "code",
      "EADDRINUSE",
    );
    expect(onError).toHaveBeenCalledOnce();
    expect(transport.address()).toBeUndefined();
    await server.close();
  } finally {
    await new Promise<void>((resolve) => occupied.close(() => resolve()));
  }
});

it("cleans up when HTTP option validation fails after binding", async () => {
  const f = fixture(false, { path: "bad" });
  await expect(f.server.listen(f.transport)).rejects.toThrow("path");
  expect(f.transport.address()).toBeUndefined();
  await f.server.close();
});

it("can close before startup or while binding without opening a listener later", async () => {
  const never = http({ port: 0 });
  await never.close();
  const first = createServer({ name: "closed", version: "1", tools: {} });
  await expect(first.listen(never)).rejects.toThrow("cannot restart");
  await first.close();
  const f = fixture();
  const started = f.server.listen(f.transport);
  const rejected = expect(started).rejects.toThrow("closed during startup");
  await f.server.close();
  await rejected;
  expect(f.transport.address()).toBeUndefined();
});

it.each([-1, 65536, 1.5, NaN])("rejects invalid port %s", (port) =>
  expect(() => http({ port })).toThrow("port"),
);
it.each(["", "http://localhost", "local host"])(
  "rejects invalid hostname %s",
  (hostname) => expect(() => http({ hostname })).toThrow("hostname"),
);

it.each([false, true])(
  "aborts active handlers with transportClose=%s and supports re-entrant shutdown",
  async (transportClose) => {
    let ready!: () => void;
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    let signal: AbortSignal | undefined;
    const server = createServer({
      name: "close-active",
      version: "1",
      tools: {
        who: tool({
          input: z.object({}),
          execute(_input, ctx) {
            signal = ctx.signal;
            return new Promise<string>((resolve) => {
              ctx.signal.addEventListener(
                "abort",
                () => {
                  void server.close();
                  resolve("discarded");
                },
                { once: true },
              );
              ready();
            });
          },
        }),
      },
    });
    const transport = http({ port: 0 });
    await server.listen(transport);
    const response = fetch(
      `http://127.0.0.1:${transport.address()?.port}/mcp`,
      request(PROTOCOL_VERSION),
    );
    const disconnected = expect(response).rejects.toThrow();
    await started;
    await (transportClose ? transport.close() : server.close());
    await disconnected;
    expect(signal?.aborted).toBe(true);
    expect(signal?.reason).toMatchObject({
      name: "AbortError",
      message: "Server closed",
    });
  },
);
