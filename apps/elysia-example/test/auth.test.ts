import { createHttpHandler } from "@toolgrain/http";
import { AuthError, createServer } from "@toolgrain/mcp";
import { Elysia } from "elysia";
import { expect, it, vi } from "vitest";

it("mounts combined auth routing alongside Elysia routes without consuming MCP bodies", async () => {
  const verify = vi.fn(async (token: string) => {
    if (token !== "valid") throw new AuthError("invalid_token");
    return { userId: "alice" };
  });
  const server = createServer({
    name: "elysia-auth",
    version: "1",
    tools: {},
    auth: {
      type: Symbol.for("elysia-auth-test"),
      authorizationServers: ["https://auth.example.com"],
      verify,
    },
  });
  const app = new Elysia()
    .get("/health", () => ({ status: "ok" }))
    .mount(
      createHttpHandler(server, {
        path: "/api/mcp",
        allowedHosts: ["localhost:3003"],
      }),
    );
  try {
    const health = await app.handle(
      new Request("http://localhost:3003/health"),
    );
    expect(await health.json()).toEqual({ status: "ok" });
    const metadata = await app.handle(
      new Request(
        "http://localhost:3003/.well-known/oauth-protected-resource/api/mcp",
      ),
    );
    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toHaveProperty(
      "resource",
      "http://localhost:3003/api/mcp",
    );
    expect(verify).not.toHaveBeenCalled();
    expect(
      (
        await app.handle(
          new Request(
            "http://evil.example.com/.well-known/oauth-protected-resource/api/mcp",
          ),
        )
      ).status,
    ).toBe(403);
    for (const revision of ["2026-07-28", "2025-06-18"]) {
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": revision,
        "Mcp-Method": "tools/list",
      };
      const body = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params:
          revision === "2026-07-28"
            ? {
                _meta: {
                  "io.modelcontextprotocol/protocolVersion": revision,
                  "io.modelcontextprotocol/clientCapabilities": {},
                },
              }
            : {},
      });
      const missing = await app.handle(
        new Request("http://localhost:3003/api/mcp", {
          method: "POST",
          headers,
          body,
        }),
      );
      expect(missing.status).toBe(401);
      expect(missing.headers.get("WWW-Authenticate")).toContain(
        "/.well-known/oauth-protected-resource/api/mcp",
      );
      const response = await app.handle(
        new Request("http://localhost:3003/api/mcp", {
          method: "POST",
          headers: { ...headers, Authorization: "Bearer valid" },
          body,
        }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toHaveProperty("result.tools", []);
    }
  } finally {
    await server.close();
  }
});
