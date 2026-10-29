import "./network-guard.mjs";

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { realpathSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { isAbsolute, relative, sep } from "node:path";
import { createInterface } from "node:readline";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { useAuth as useClerkAuth } from "@toolgrain/clerk";
import { createHttpHandler } from "@toolgrain/http";
import { jwt, useAuth as useJwtAuth } from "@toolgrain/jwt";
import { createServer, tool, toolContext } from "@toolgrain/mcp";
import { createNodeHttpHandler } from "@toolgrain/node";
import {
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@toolgrain/protocol";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { z } from "zod";
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
  assert.equal(
    Boolean(process.versions.bun),
    process.env.TOOLGRAIN_EXPECT_RUNTIME === "bun",
  );
  const modules = realpathSync(
    fileURLToPath(new URL("./node_modules/", import.meta.url)),
  );
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
    const path = relative(modules, resolved);
    assert(!isAbsolute(path) && !path.startsWith(`..${sep}`), resolved);
    assert(resolved.includes(`${sep}dist${sep}`), resolved);
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
  const mock = Symbol.for("toolgrain.test.auth-fetch");
  globalThis[mock] = () => {
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
        auth: provider(["openid", "profile"]),
      });
      try {
        assert.deepEqual(protectedServer.getAuthMetadata(), {
          authorizationServers: [issuer],
          scopesSupported: ["openid", "profile"],
        });
        const handle = createHttpHandler(protectedServer);
        const metadata = await handle(
          new Request(
            "http://localhost/.well-known/oauth-protected-resource/mcp",
          ),
        );
        assert.equal(metadata.status, 200);
        assert.deepEqual((await metadata.json()).scopes_supported, [
          "openid",
          "profile",
        ]);
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
    delete globalThis[mock];
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
    const stopped = new Promise((resolve, reject) =>
      http.close((error) => (error ? reject(error) : resolve())),
    );
    http.closeAllConnections();
    await stopped;
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

// Exercise real crypto and provider code; discovery/JWKS responses stay offline.
test("signed JWT and Clerk OAuth verification enforce audiences and freeze identities", async () => {
  const mock = Symbol.for("toolgrain.test.auth-fetch");
  try {
    for (const algorithm of ["RS256", "ES256"]) {
      const key = await generateKeyPair(algorithm);
      const jwk = {
        ...(await exportJWK(key.publicKey)),
        kid: "support",
        alg: algorithm,
      };
      const resource = "https://api.example.com/mcp";
      for (const kind of algorithm === "RS256" ? ["jwt", "clerk"] : ["jwt"]) {
        const issuer =
          kind === "jwt"
            ? "https://auth.example.com"
            : "https://example.clerk.accounts.dev";
        globalThis[mock] = async (address) => {
          const url = String(address);
          if (url === `${issuer}/keys`) return Response.json({ keys: [jwk] });
          assert(
            url.startsWith(`${issuer}/.well-known/`),
            `Unexpected auth network request: ${url}`,
          );
          return Response.json({ issuer, jwks_uri: `${issuer}/keys` });
        };
        const provider = kind === "jwt" ? jwt({ issuer }) : clerkProvider();
        const access = kind === "jwt" ? useJwtAuth : useClerkAuth;
        const hosted = createServer({
          name: "signed-auth",
          version: "1",
          auth: provider,
          tools: {
            who: tool({
              input: z.object({}),
              execute(_input, ctx) {
                const identity = access(ctx);
                assert(Object.isFrozen(identity));
                assert(
                  Object.isFrozen(
                    kind === "jwt" ? identity.claims : identity.scopes,
                  ),
                );
                return kind === "jwt" ? identity.claims.sub : identity.userId;
              },
            }),
          },
        });
        const sign = (aud) =>
          new SignJWT({
            iss: issuer,
            aud,
            sub: "user_support",
            client_id: "client_support",
            scope: "profile",
            exp: Math.floor(Date.now() / 1000) + 300,
          })
            .setProtectedHeader({
              alg: algorithm,
              kid: "support",
              typ: "at+jwt",
            })
            .sign(key.privateKey);
        try {
          const token = await sign(resource);
          for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
            const scope = await hosted.authorize(token, { resource });
            try {
              const response = await hosted.handle(
                request(version, 1, "tools/call", { name: "who" }),
                { protocolVersion: version, auth: scope },
              );
              assert.equal(response.result.content[0].text, "user_support");
            } finally {
              scope.dispose();
            }
          }
          await assert.rejects(
            hosted.authorize(await sign("https://wrong.example.com"), {
              resource,
            }),
            { code: "invalid_token" },
          );
          if (kind === "clerk") {
            // The Clerk SDK's opaque-token path also runs with a synthetic response.
            globalThis[mock] = async () =>
              Response.json(
                {
                  object: "clerk_idp_oauth_access_token",
                  id: "oat_support",
                  client_id: "client_support",
                  subject: "user_support",
                  scopes: ["profile"],
                  revoked: false,
                  revocation_reason: null,
                  expired: false,
                  expiration: Math.floor(Date.now() / 1000) + 300,
                  created_at: 1,
                  updated_at: 1,
                  aud: [resource],
                },
                { headers: { "Content-Type": "application/json" } },
              );
            const verified = await provider.verify("oat_support", {
              resource,
              signal: new AbortController().signal,
            });
            assert.equal(verified.userId, "user_support");
          }
        } finally {
          await hosted.close();
        }
      }
    }
  } finally {
    delete globalThis[mock];
  }
});

function request(version, id, method, params = {}) {
  return {
    jsonrpc: "2.0",
    id,
    method,
    params: {
      ...params,
      ...(version === PROTOCOL_VERSION
        ? {
            _meta: {
              "io.modelcontextprotocol/protocolVersion": version,
              "io.modelcontextprotocol/clientCapabilities": {},
            },
          }
        : {}),
    },
  };
}

function deadline(promise) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("Runtime probe timed out")),
        5000,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

test("HTTP disconnect aborts handlers in both protocol eras", {
  timeout: 15000,
}, async () => {
  for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
    let started, aborted;
    const ready = new Promise((resolve) => {
      started = resolve;
    });
    const stopped = new Promise((resolve) => {
      aborted = resolve;
    });
    const hosted = createServer({
      name: "disconnect",
      version: "1",
      tools: {
        wait: tool({
          input: z.object({}),
          async execute(_input, ctx) {
            started();
            await new Promise((resolve) =>
              ctx.signal.addEventListener(
                "abort",
                () => {
                  aborted(ctx.signal.reason);
                  resolve();
                },
                { once: true },
              ),
            );
            return "late";
          },
        }),
      },
    });
    const handler = createNodeHttpHandler(hosted);
    const http = createHttpServer((incoming, outgoing) => {
      void handler(incoming, outgoing);
    });
    const abort = new AbortController();
    try {
      http.listen(0, "127.0.0.1");
      await once(http, "listening");
      const response = fetch(`http://127.0.0.1:${http.address().port}/mcp`, {
        method: "POST",
        signal: abort.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": version,
          "Mcp-Method": "tools/call",
          "Mcp-Name": "wait",
        },
        body: JSON.stringify(
          request(version, 1, "tools/call", { name: "wait" }),
        ),
      });
      const rejected = assert.rejects(response, { name: "AbortError" });
      await deadline(ready);
      abort.abort();
      await rejected;
      assert.equal((await deadline(stopped)).name, "AbortError");
    } finally {
      abort.abort();
      await hosted.close();
      http.closeAllConnections();
      await new Promise((resolve) => http.close(resolve));
    }
  }
});

test("stdio cancellation aborts handlers and permits later requests", {
  timeout: 15000,
}, async () => {
  for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
    const child = spawn(
      process.execPath,
      ["dist/consumer.mjs", "stdio-cancellation"],
      {
        stdio: "pipe",
        timeout: 10000,
        killSignal: "SIGKILL",
      },
    );
    const closed = once(child, "close");
    const output = createInterface({ input: child.stdout });
    const diagnostics = createInterface({ input: child.stderr });
    const messages = output[Symbol.asyncIterator]();
    const signals = diagnostics[Symbol.asyncIterator]();
    const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
    const read = async () => {
      const line = await deadline(messages.next());
      assert.equal(line.done, false);
      return JSON.parse(line.value);
    };
    try {
      if (version === LEGACY_PROTOCOL_VERSION) {
        send(
          request(version, 1, "initialize", {
            protocolVersion: version,
            capabilities: {},
            clientInfo: { name: "support", version: "1" },
          }),
        );
        assert.equal((await read()).result.protocolVersion, version);
        send({ jsonrpc: "2.0", method: "notifications/initialized" });
      }
      send(request(version, 2, "tools/call", { name: "wait" }));
      assert.equal((await deadline(signals.next())).value, "started");
      send({
        jsonrpc: "2.0",
        method: "notifications/cancelled",
        params: { requestId: 2 },
      });
      assert.equal((await deadline(signals.next())).value, "aborted");
      send(request(version, 3, "tools/list"));
      assert.equal((await read()).id, 3); // The cancelled call must not deliver a result.
      child.stdin.end();
      assert.deepEqual(await closed, [0, null]);
    } finally {
      output.close();
      diagnostics.close();
      child.kill("SIGKILL");
      await closed;
    }
  }
});
