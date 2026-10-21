import { type AuthProvider, createServer } from "@toolgrain/mcp";
import { expect, it, vi } from "vitest";
import {
  createHttpHandler,
  createProtectedResourceMetadataHandler,
  type HttpOptions,
} from "../src/index.js";

const prefix = "/.well-known/oauth-protected-resource";
function fixture(options: HttpOptions = {}, resource?: string) {
  const verify = vi.fn(async () => ({}));
  const auth: AuthProvider = {
    type: Symbol.for("routing-test"),
    authorizationServers: ["https://auth.example.com"],
    verify,
    ...(resource === undefined ? {} : { resource }),
  };
  const server = createServer({
    name: "routing",
    version: "1",
    tools: {},
    auth,
  });
  return { server, verify, handle: createHttpHandler(server, options) };
}

it.each(["/mcp", "/public/mcp", "/mcp/", "/"])(
  "routes public metadata automatically for endpoint %s",
  async (path) => {
    const f = fixture({ path });
    const suffix = path === "/" ? "" : path;
    const url = `http://localhost:3003${prefix}${suffix}`;
    const response = await f.handle(new Request(`${url}?trace=1`));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      resource: `http://localhost:3003${suffix}`,
      authorization_servers: ["https://auth.example.com"],
      bearer_methods_supported: ["header"],
    });
    const head = await f.handle(new Request(url, { method: "HEAD" }));
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await f.handle(new Request(url, { method: "POST" }))).status).toBe(
      405,
    );
    expect(
      (await f.handle(new Request(`http://localhost:3003${path}`))).status,
    ).toBe(405);
    for (const extra of ["/unrelated", `${prefix}/other`, `${path}extra`])
      expect(
        (await f.handle(new Request(`http://localhost:3003${extra}`))).status,
      ).toBe(404);
    expect(f.verify).not.toHaveBeenCalled();
    await f.server.close();
  },
);

it("exposes metadata only for protected servers and follows an explicit public resource path", async () => {
  const plain = createServer({ name: "plain", version: "1", tools: {} });
  expect(
    (
      await createHttpHandler(plain)(
        new Request(`http://localhost${prefix}/mcp`),
      )
    ).status,
  ).toBe(404);
  const f = fixture(
    { path: "/internal" },
    "https://api.example.com/public/mcp",
  );
  const response = await f.handle(
    new Request(`http://localhost${prefix}/public/mcp`),
  );
  expect(await response.json()).toHaveProperty(
    "resource",
    "https://api.example.com/public/mcp",
  );
  expect(
    (await f.handle(new Request(`http://localhost${prefix}/internal`))).status,
  ).toBe(404);
  await Promise.all([plain.close(), f.server.close()]);
});

it("allows loopback by default and rejects other hosts before routing, body parsing, and verification", async () => {
  const f = fixture();
  for (const host of [
    "localhost",
    "localhost:8080",
    "127.0.0.1:4000",
    "[::1]:3000",
  ])
    expect(
      (await f.handle(new Request(`http://${host}${prefix}/mcp`))).status,
    ).toBe(200);
  for (const path of ["/mcp", `${prefix}/mcp`, "/unrelated"]) {
    const response = await f.handle(
      new Request(`https://evil.example.com${path}`, {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
        body: "{",
      }),
    );
    expect(response.status).toBe(403);
  }
  for (const url of [
    "https://localhost.evil.example.com/mcp",
    "https://localhost./mcp",
    "ftp://localhost/mcp",
  ])
    expect((await f.handle(new Request(url))).status).toBe(403);
  expect(f.verify).not.toHaveBeenCalled();
  await f.server.close();
});

it("snapshots exact host allowlists, including IPv6, case, and default ports", async () => {
  const allowedHosts = ["API.Example.com:443", "[::1]:3003", "localhost:80"];
  const f = fixture({ allowedHosts });
  allowedHosts.push("evil.example.com");
  for (const url of [
    "https://api.example.com",
    "https://api.example.com:443",
    "http://[::1]:3003",
    "http://localhost",
  ])
    expect((await f.handle(new Request(`${url}${prefix}/mcp`))).status).toBe(
      200,
    );
  for (const url of [
    "https://evil.example.com",
    "http://api.example.com",
    "https://api.example.com:444",
    "http://localhost:3003",
    "http://[::1]:3004",
  ])
    expect((await f.handle(new Request(`${url}${prefix}/mcp`))).status).toBe(
      403,
    );
  const deny = fixture({ allowedHosts: [] });
  expect((await deny.handle(new Request("http://localhost/mcp"))).status).toBe(
    403,
  );
  await Promise.all([f.server.close(), deny.server.close()]);
});

it("validates a supplied Host header against the URL and ignores forwarded hosts", async () => {
  const f = fixture({ allowedHosts: ["api.example.com"] });
  for (const host of [
    "evil.example.com",
    "api.example.com, evil.example.com",
    "user@api.example.com",
    "api.example.com/path",
  ])
    expect(
      (
        await f.handle(
          new Request(`https://api.example.com${prefix}/mcp`, {
            headers: { Host: host },
          }),
        )
      ).status,
    ).toBe(403);
  expect(
    (
      await f.handle(
        new Request(`https://api.example.com${prefix}/mcp`, {
          headers: {
            Host: "API.EXAMPLE.COM:443",
            "X-Forwarded-Host": "evil.example.com",
            Forwarded: "host=evil.example.com",
          },
        }),
      )
    ).status,
  ).toBe(200);
  const metadata = createProtectedResourceMetadataHandler(f.server);
  expect(
    (await metadata(new Request(`https://evil.example.com${prefix}/mcp`)))
      .status,
  ).toBe(403);
  await f.server.close();
});

it.each([
  "mcp",
  "//evil.example.com/mcp",
  "/mcp?x=1",
  "/mcp#x",
  "/mcp/../other",
  "/%2e%2e/mcp",
  "/white space",
  "/back\\slash",
])("rejects invalid endpoint path %s", (path) => {
  const server = createServer({ name: "options", version: "1", tools: {} });
  expect(() => createHttpHandler(server, { path })).toThrow("path");
});
it.each([
  "",
  "*",
  "https://api.example.com",
  "api.example.com/path",
  "user@api.example.com",
  "api.example.com:bad",
  "api.example.com:",
  "api.example.com?x=1",
  "api.example.com,evil.example.com",
  " api.example.com",
  "api.example.com%2e",
])("rejects invalid allowed host %s", (host) => {
  const server = createServer({ name: "options", version: "1", tools: {} });
  expect(() => createHttpHandler(server, { allowedHosts: [host] })).toThrow();
});

it("preserves a validated Host authority when a framework normalizes the URL hostname", async () => {
  const f = fixture();
  const response = await f.handle(
    new Request(`http://localhost:3003${prefix}/mcp`, {
      headers: { Host: "127.0.0.1:3003" },
    }),
  );
  expect(await response.json()).toHaveProperty(
    "resource",
    "http://127.0.0.1:3003/mcp",
  );
  const blocked = await f.handle(
    new Request(`http://localhost:3003${prefix}/mcp`, {
      headers: { Host: "evil.example.com" },
    }),
  );
  expect(blocked.status).toBe(403);
  await f.server.close();
});
