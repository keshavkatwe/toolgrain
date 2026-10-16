import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

async function availablePort() {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  assert(address && typeof address !== "string");
  await new Promise((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

/** Start the example's documented command and exercise its real MCP endpoint. */
export async function testHttpExample(workspace) {
  const port = await availablePort();
  const child = spawn("bun", ["run", "start"], {
    cwd: workspace,
    env: { ...process.env, PORT: String(port), FASTIFY_PORT: String(port) },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const capture = (chunk) => {
    output = (output + chunk.toString()).slice(-16000);
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  const exited = new Promise((resolve) => child.once("exit", resolve));
  let spawnError;
  child.once("error", (error) => {
    spawnError = error;
  });
  const url = `http://127.0.0.1:${port}/mcp`;
  try {
    const deadline = Date.now() + 45000;
    for (;;) {
      if (spawnError) throw spawnError;
      assert(
        child.exitCode === null && child.signalCode === null,
        `Example exited before startup:\n${output}`,
      );
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.status === 405) break;
      } catch {
        /* The native server may still be starting. */
      }
      assert(Date.now() < deadline, `Example did not become ready:\n${output}`);
      await delay(100);
    }
    for (const method of ["server/discover", "tools/list", "tools/call"]) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2026-07-28",
          "Mcp-Method": method,
          ...(method === "tools/call" ? { "Mcp-Name": "greet" } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params: {
            _meta: {
              "io.modelcontextprotocol/protocolVersion": "2026-07-28",
              "io.modelcontextprotocol/clientCapabilities": {},
            },
            ...(method === "tools/call"
              ? { name: "greet", arguments: { name: "Ada" } }
              : {}),
          },
        }),
        signal: AbortSignal.timeout(10000),
      });
      assert.equal(response.status, 200, output);
      const message = await response.json();
      assert.equal(message.id, 1);
      if (method === "tools/call")
        assert.equal(message.result.structuredContent.message, "Hello, Ada!");
      else if (method === "tools/list")
        assert.equal(message.result.tools[0].name, "greet");
      else assert.deepEqual(message.result.supportedVersions, ["2026-07-28"]);
    }
  } finally {
    // CLI commands can start child processes; terminate the entire test-owned group.
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        /* Already exited. */
      }
      await Promise.race([exited, delay(2000)]);
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* Graceful shutdown completed. */
      }
    }
  }
}
