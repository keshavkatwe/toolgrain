import { expect, it } from "vitest";
import { honoApp } from "../src/app.js";

it("preserves routes registered after MCP middleware and their request bodies", async () => {
  const { app, server } = honoApp();
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.post("/echo", async (c) => c.json(await c.req.json()));
  try {
    const health = await app.request("http://localhost/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok" });
    const echo = await app.request("http://localhost/echo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "untouched" }),
    });
    expect(await echo.json()).toEqual({ message: "untouched" });
    expect((await app.request("http://localhost/mcp")).status).toBe(405);
  } finally {
    await server.close();
  }
});
