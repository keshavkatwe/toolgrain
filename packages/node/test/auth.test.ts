import { createServer as httpServer, request as sendHttp } from "node:http";
import type { AddressInfo } from "node:net";
import {
  AuthError,
  createAuthAccessor,
  createServer,
  tool,
  validateTokenAudience,
} from "@toolgrain/mcp";
import { expect, it } from "vitest";
import { z } from "zod";
import {
  createNodeHttpHandler,
  createNodeProtectedResourceMetadataHandler,
} from "../src/index.js";

it("preserves the actual endpoint for authentication and public metadata over real HTTP", async () => {
  const type = Symbol.for("node-test/auth");
  const useAuth = createAuthAccessor<{ userId: string }>(type);
  let expectedResource = "";
  const server = createServer({
    name: "auth",
    version: "1",
    auth: {
      type,
      authorizationServers: ["https://auth.example.com"],
      async verify(token, { resource }) {
        if (token === "missing-aud") validateTokenAudience(undefined, resource);
        if (token !== "valid" || resource !== expectedResource)
          throw new AuthError("invalid_token");
        return { userId: "alice" };
      },
    },
    tools: {
      who: tool({
        input: z.object({}),
        execute(_input, ctx) {
          return useAuth(ctx).userId;
        },
      }),
    },
  });
  const handler = createNodeHttpHandler(server, { path: "/public/mcp" });
  const http = httpServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  expectedResource = `${origin}/public/mcp`;
  try {
    const info = await fetch(
      `${origin}/.well-known/oauth-protected-resource/public/mcp`,
    );
    expect(info.status).toBe(200);
    expect(await info.json()).toHaveProperty("resource", expectedResource);
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
      Authorization: "Bearer valid",
      "X-Forwarded-Host": "evil.example.com",
      "X-Forwarded-Proto": "https",
    };
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "who" },
    });
    const result = await fetch(expectedResource, {
      method: "POST",
      headers,
      body,
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toHaveProperty(
      "result.content.0.text",
      "alice",
    );
    expect(
      (
        await fetch(expectedResource, {
          method: "POST",
          headers: { ...headers, Authorization: "Bearer invalid" },
          body,
        })
      ).status,
    ).toBe(401);
    const missingAudience = await fetch(expectedResource, {
      method: "POST",
      headers: { ...headers, Authorization: "Bearer missing-aud" },
      body,
    });
    expect(missingAudience.status).toBe(401);
    const failure = await missingAudience.json();
    expect(failure).toMatchObject({
      error: "invalid_token",
      error_description: expect.stringContaining("missing the aud claim"),
    });
    expect(failure.error_description).toContain(expectedResource);
    expect(missingAudience.headers.get("WWW-Authenticate")).toContain(
      `error_description="${failure.error_description}"`,
    );
    const invalidHost = await new Promise<number | undefined>(
      (resolve, reject) => {
        const req = sendHttp(
          expectedResource,
          { method: "POST", headers: { ...headers, Host: "bad:port" } },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          },
        );
        req.on("error", reject);
        req.end(body);
      },
    );
    expect(invalidHost).toBe(400);
  } finally {
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
    await server.close();
  }
});

it("retains separately mounted metadata with the same host validation", async () => {
  const server = createServer({
    name: "metadata",
    version: "1",
    tools: {},
    auth: {
      type: Symbol.for("node-metadata-test"),
      authorizationServers: ["https://auth.example.com"],
      async verify() {
        return {};
      },
    },
  });
  const metadata = createNodeProtectedResourceMetadataHandler(server, {
    allowedHosts: ["localhost"],
  });
  const listener = httpServer((req, res) => {
    void metadata(req, res);
  });
  await new Promise<void>((resolve) =>
    listener.listen(0, "127.0.0.1", resolve),
  );
  try {
    const origin = `http://127.0.0.1:${(listener.address() as AddressInfo).port}`;
    const result = await new Promise<number | undefined>((resolve, reject) => {
      const req = sendHttp(
        `${origin}/.well-known/oauth-protected-resource/mcp`,
        { headers: { Host: "localhost" } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on("error", reject);
      req.end();
    });
    expect(result).toBe(200);
    expect(
      (await fetch(`${origin}/.well-known/oauth-protected-resource/mcp`))
        .status,
    ).toBe(403);
  } finally {
    listener.closeAllConnections();
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    await server.close();
  }
});
