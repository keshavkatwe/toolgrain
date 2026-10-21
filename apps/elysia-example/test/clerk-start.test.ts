import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { expect, it } from "vitest";

const workspace = new URL("../", import.meta.url);
const fixture = {
  ...process.env,
  CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from("sample-app.clerk.accounts.dev$").toString("base64")}`,
  CLERK_SECRET_KEY: "sk_test_example",
  MCP_RESOURCE: "",
  PORT: "0",
};

it.each(["CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"] as const)(
  "refuses compiled Clerk startup without %s",
  (name) => {
    const child = spawnSync("bun", ["run", "start:clerk"], {
      cwd: workspace,
      env: { ...fixture, [name]: "" },
      encoding: "utf8",
      timeout: 10000,
    });
    expect(child.error).toBeUndefined();
    expect(child.status).not.toBe(0);
    expect(child.stderr).toContain(
      "Set CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY",
    );
  },
);

it("starts the compiled Clerk command with public discovery and protected MCP", async () => {
  const child = spawn("bun", ["run", "start:clerk"], {
    cwd: workspace,
    env: fixture,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let spawnError: Error | undefined;
  const capture = (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-16000);
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  child.on("error", (error) => {
    spawnError = error;
  });
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  try {
    const deadline = Date.now() + 15000;
    let endpoint: string | undefined;
    while (!endpoint) {
      if (spawnError) throw spawnError;
      expect(child.exitCode, output).toBeNull();
      endpoint = /Clerk MCP endpoint: (http:\/\/127\.0\.0\.1:\d+\/mcp)/.exec(
        output,
      )?.[1];
      if (!endpoint) {
        if (Date.now() > deadline)
          throw new Error(`Clerk startup timed out: ${output}`);
        await delay(50);
      }
    }
    const origin = new URL(endpoint).origin;
    const metadata = await fetch(
      `${origin}/.well-known/oauth-protected-resource/mcp`,
    );
    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toHaveProperty("resource", endpoint);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: "invalid JSON should not be parsed before auth",
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain(
      `${origin}/.well-known/oauth-protected-resource/mcp`,
    );
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(output).not.toContain(fixture.CLERK_SECRET_KEY);
  } finally {
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        /* Already stopped. */
      }
      await Promise.race([exited, delay(2000)]);
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* Shutdown completed. */
      }
    }
  }
}, 30000);
