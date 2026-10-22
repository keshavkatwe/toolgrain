import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { realpathSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { useAuth as useClerkAuth } from "@toolgrain/clerk";
import { useAuth as useJwtAuth } from "@toolgrain/jwt";
import { createServer, toolContext } from "@toolgrain/mcp";
import {
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@toolgrain/protocol";
import {
  clerkProvider,
  directContext,
  greeting,
  jwtProvider,
  listener,
  nodeHandler,
  server,
  webHandler,
} from "./dist/consumer.mjs";

test("imports resolve to installed archives, without repository tooling", () => {
  assert.equal(process.versions.bun, undefined);
  const modules = `${realpathSync(join(process.cwd(), "node_modules"))}/`;
  for (const name of [
    "protocol",
    "mcp",
    "http",
    "node",
    "jwt",
    "clerk",
    "protocol/2025-06-18",
  ]) {
    const resolved = realpathSync(
      fileURLToPath(import.meta.resolve(`@toolgrain/${name}`)),
    );
    assert(resolved.startsWith(modules), resolved);
    assert(resolved.includes("/dist/"), resolved);
  }
  assert.throws(() => import.meta.resolve("@toolgrain/repo-tools"));
});

test("context inference and overrides work from installed declarations", async () => {
  const ctx = directContext();
  const [first, second] = await Promise.all([
    greeting.use(ctx),
    greeting.use(ctx),
  ]);
  assert.equal(first, second);
  assert.deepEqual(first, { prefix: "Welcome" });
});

test("JWT and Clerk initialize without credentials or external requests", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("Auth smoke checks must not use the network");
  };
  try {
    for (const [provider, issuer, useAuth] of [
      [jwtProvider, "https://auth.example.com", useJwtAuth],
      [clerkProvider, "https://example.clerk.accounts.dev", useClerkAuth],
    ]) {
      const protectedServer = createServer({
        name: "auth",
        version: "1",
        tools: {},
        auth: provider(),
      });
      try {
        assert.deepEqual(protectedServer.getAuthMetadata(), {
          authorizationServers: [issuer],
        });
        assert.throws(() => useAuth(toolContext()), /no identity/);
        await assert.rejects(
          protectedServer.handle({}),
          /Invalid access token/,
        );
      } finally {
        await protectedServer.close();
      }
    }
  } finally {
    globalThis.fetch = original;
  }
});

/** The same installed tool works in both protocol eras and on every adapter. */
async function exercise(request, notify) {
  let id = 0;
  for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
    const modern = version === PROTOCOL_VERSION;
    const send = async (method, params = {}) => {
      const message = {
        jsonrpc: "2.0",
        id: ++id,
        method,
        params: {
          ...params,
          ...(modern
            ? {
                _meta: {
                  "io.modelcontextprotocol/protocolVersion": version,
                  "io.modelcontextprotocol/clientCapabilities": {},
                },
              }
            : {}),
        },
      };
      const response = await request(message, version);
      assert.equal(response.id, message.id);
      assert.equal(response.error, undefined, JSON.stringify(response));
      assert.equal(response.result.resultType, modern ? "complete" : undefined);
      return response.result;
    };
    if (modern) {
      assert.deepEqual((await send("server/discover")).supportedVersions, [
        ...SUPPORTED_PROTOCOL_VERSIONS,
      ]);
    } else {
      const initialized = await send("initialize", {
        protocolVersion: LEGACY_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "clean-install-client", version: "1" },
      });
      assert.equal(initialized.protocolVersion, LEGACY_PROTOCOL_VERSION);
      await notify(
        { jsonrpc: "2.0", method: "notifications/initialized" },
        version,
      );
    }
    const { tools } = await send("tools/list");
    assert.equal(tools.length, 1);
    assert.equal(tools[0].name, "greet");
    assert.equal(tools[0].title, "Greeting");
    assert.equal(tools[0].annotations.readOnlyHint, true);
    assert.equal(tools[0].inputSchema.type, "object");
    assert.equal(tools[0].outputSchema.type, "object");
    const result = await send("tools/call", {
      name: "greet",
      arguments: { name: "  Zoë 世界  " },
    });
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, { message: "Hello, Zoë 世界!" });
    assert.deepEqual(result.content, [
      { type: "text", text: JSON.stringify(result.structuredContent) },
    ]);
    assert.equal(
      (await send("tools/call", { name: "greet", arguments: { name: "" } }))
        .isError,
      true,
    );
  }
}

function httpClient(fetchResponse) {
  const post = async (message, version) => {
    const response = await fetchResponse({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": version,
        ...(version === PROTOCOL_VERSION
          ? {
              "Mcp-Method": message.method,
              ...(message.method === "tools/call"
                ? { "Mcp-Name": message.params.name }
                : {}),
            }
          : {}),
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(
      response.status,
      "id" in message ? 200 : 202,
      await response.clone().text(),
    );
    return response;
  };
  return [
    async (message, version) => (await post(message, version)).json(),
    async (message, version) =>
      assert.equal(await (await post(message, version)).text(), ""),
  ];
}

test("Web HTTP handler serves both revisions", { timeout: 15000 }, async () => {
  const hosted = server();
  const handler = webHandler(hosted);
  try {
    await exercise(
      ...httpClient((init) =>
        handler(new Request("http://localhost/mcp", init)),
      ),
    );
  } finally {
    await hosted.close();
  }
});

test("Node HTTP handler serves both revisions through a real listener", {
  timeout: 15000,
}, async () => {
  const hosted = server();
  const handler = nodeHandler(hosted);
  const http = createHttpServer((request, response) => {
    void handler(request, response);
  });
  try {
    http.listen(0, "127.0.0.1");
    await once(http, "listening");
    await exercise(
      ...httpClient((init) =>
        fetch(`http://127.0.0.1:${http.address().port}/mcp`, init),
      ),
    );
  } finally {
    http.closeAllConnections();
    await new Promise((resolve, reject) =>
      http.close((error) => (error ? reject(error) : resolve())),
    );
    await hosted.close();
  }
});

test("managed Node HTTP transport serves both revisions and closes", {
  timeout: 15000,
}, async () => {
  const hosted = server();
  const transport = listener();
  try {
    await hosted.listen(transport);
    await exercise(
      ...httpClient((init) =>
        fetch(`http://127.0.0.1:${transport.address().port}/mcp`, init),
      ),
    );
  } finally {
    await hosted.close();
  }
  assert.equal(transport.address(), undefined);
});

test("compiled consumer serves both revisions over real stdin/stdout", {
  timeout: 15000,
}, async () => {
  const child = spawn(process.execPath, ["dist/consumer.mjs", "stdio"], {
    stdio: "pipe",
    timeout: 10000,
    killSignal: "SIGKILL",
  });
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (data) => {
    stderr += data;
  });
  const closed = once(child, "close");
  const lines = createInterface({ input: child.stdout });
  const iterator = lines[Symbol.asyncIterator]();
  const send = (message) => {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };
  try {
    await exercise(
      async (message) => {
        send(message);
        const line = await iterator.next();
        assert.equal(line.done, false, stderr);
        return JSON.parse(line.value);
      },
      async (message) => send(message),
    );
    child.stdin.end();
    assert.deepEqual(await closed, [0, null], stderr);
    assert.equal(stderr, "");
  } finally {
    lines.close();
    child.kill("SIGKILL");
    await closed;
  }
});
