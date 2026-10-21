import { request as sendHttp } from "node:http";
import type { AddressInfo } from "node:net";
import { AuthError, createServer } from "@toolgrain/mcp";
import { createNodeHttpHandler } from "@toolgrain/node";
import express from "express";
import { expect, it, vi } from "vitest";

it("falls through for REST routes without consuming their bodies and retains MCP/auth/metadata responses", async () => {
  const verify = vi.fn(async (token: string) => {
    if (token !== "valid") throw new AuthError("invalid_token");
    return {};
  });
  const server = createServer({
    name: "express-routing",
    version: "1",
    tools: {},
    auth: {
      type: Symbol.for("express-routing-test"),
      authorizationServers: ["https://auth.example.com"],
      verify,
    },
  });
  const app = express();
  app.use(createNodeHttpHandler(server));
  app.use(express.json());
  app.get("/health", (_request, response) => response.json({ status: "ok" }));
  app.post("/echo", (request, response) => response.json(request.body));
  const fallback = vi.fn(
    (_request: express.Request, response: express.Response) =>
      response.status(418).json({ fallback: true }),
  );
  app.use(fallback);
  const listener = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => listener.once("listening", resolve));
  const origin = `http://127.0.0.1:${(listener.address() as AddressInfo).port}`;
  try {
    const health = await fetch(`${origin}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok" });
    const echo = await fetch(`${origin}/echo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nested: { message: "untouched body" } }),
    });
    expect(echo.status).toBe(200);
    expect(await echo.json()).toEqual({
      nested: { message: "untouched body" },
    });
    const metadata = await fetch(
      `${origin}/.well-known/oauth-protected-resource/mcp`,
    );
    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toHaveProperty("resource", `${origin}/mcp`);
    expect(verify).not.toHaveBeenCalled();
    expect((await fetch(`${origin}/mcp`)).status).toBe(405);
    const revision = "2026-07-28";
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": revision,
      "Mcp-Method": "unknown/method",
    };
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "unknown/method",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": revision,
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    });
    expect(
      (await fetch(`${origin}/mcp?trace=1`, { method: "POST", headers, body }))
        .status,
    ).toBe(401);
    const protocol = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: { ...headers, Authorization: "Bearer valid" },
      body,
    });
    expect(protocol.status).toBe(404);
    expect(await protocol.json()).toHaveProperty("error.code", -32601);
    expect(
      await new Promise<number | undefined>((resolve, reject) => {
        const request = sendHttp(
          `${origin}/mcp`,
          { headers: { Host: "evil.example.com" } },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        );
        request.on("error", reject);
        request.end();
      }),
    ).toBe(403);
    expect(fallback).not.toHaveBeenCalled();
    expect((await fetch(`${origin}/missing`)).status).toBe(418);
    expect(fallback).toHaveBeenCalledOnce();
  } finally {
    await server.close();
    listener.closeAllConnections();
    await new Promise<void>((resolve) => listener.close(() => resolve()));
  }
});
