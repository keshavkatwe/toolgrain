import {
  AuthError,
  type AuthProvider,
  createAuthAccessor,
  createServer,
  type ToolContext,
  tool,
} from "@toolgrain/mcp";
import { LEGACY_PROTOCOL_VERSION, PROTOCOL_VERSION } from "@toolgrain/protocol";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createHttpHandler,
  createProtectedResourceMetadataHandler,
} from "../src/index.js";

const type = Symbol.for("http-test/auth");
const useAuth = createAuthAccessor<{ userId: string }>(type);
const issuer = "https://auth.example.com";
const endpoint = "https://api.example.com/mcp";
const makeProvider = (
  verify: AuthProvider["verify"] = async (token) => {
    if (token !== "valid") throw new AuthError("invalid_token");
    return { userId: "alice" };
  },
): AuthProvider => ({ type, authorizationServers: [issuer], verify });

function setup(provider = makeProvider()) {
  const options = {
    allowedHosts: [
      "api.example.com",
      "one.example.com",
      "two.example.com",
      "untrusted.example.com",
      "bad.example.com",
      "internal.example.com",
    ],
  };
  const execute = vi.fn(
    (_input: object, ctx: ToolContext) => useAuth(ctx).userId,
  );
  const server = createServer({
    name: "auth",
    version: "1",
    auth: provider,
    tools: { who: tool({ input: z.object({}), execute }) },
  });
  return {
    server,
    execute,
    handle: createHttpHandler(server, options),
    metadata: createProtectedResourceMetadataHandler(server, options),
  };
}

function request(
  revision = PROTOCOL_VERSION as string,
  token: string | null = "valid",
  url = endpoint,
) {
  const modern = revision === PROTOCOL_VERSION;
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": revision,
      "Mcp-Method": "tools/call",
      "Mcp-Name": "who",
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "who",
        arguments: {},
        ...(modern
          ? {
              _meta: {
                "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
                "io.modelcontextprotocol/clientCapabilities": {},
              },
            }
          : {}),
      },
    }),
  });
}

it.each([PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION])(
  "authenticates the complete tools flow for %s",
  async (revision) => {
    const f = setup();
    const response = await f.handle(request(revision));
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty(
      "result.content.0.text",
      "alice",
    );
    expect(f.execute).toHaveBeenCalledOnce();
    const ctx = f.execute.mock.calls[0]?.[1];
    expect(ctx?.signal.aborted).toBe(false);
    for (const token of [null, "invalid"]) {
      const rejected = await f.handle(request(revision, token));
      expect(rejected.status).toBe(401);
      expect(rejected.headers.get("WWW-Authenticate")).toContain(
        'resource_metadata="https://api.example.com/.well-known/oauth-protected-resource/mcp"',
      );
      expect(rejected.headers.get("Cache-Control")).toBe("no-store");
      expect(JSON.stringify(await rejected.json())).not.toContain(
        "invalid-secret",
      );
    }
    expect(f.execute).toHaveBeenCalledOnce();
    await f.server.close();
    expect(ctx?.signal.aborted).toBe(false);
  },
);

it("rejects malformed bearer headers and query tokens, and ignores cookies", async () => {
  const f = setup();
  for (const header of [
    "Bearer",
    "Bearer a b",
    "Bearer a, Bearer b",
    "Bearer bad!",
    "Bearer\ta",
  ]) {
    const req = request();
    req.headers.set("Authorization", header);
    expect((await f.handle(req)).status).toBe(400);
  }
  const unsupported = request();
  unsupported.headers.set("Authorization", "Basic abc");
  expect((await f.handle(unsupported)).status).toBe(401);
  const cookie = request(PROTOCOL_VERSION, null);
  cookie.headers.set("Cookie", "access_token=valid");
  expect((await f.handle(cookie)).status).toBe(401);
  expect(
    (
      await f.handle(
        request(PROTOCOL_VERSION, "valid", `${endpoint}?access_token=valid`),
      )
    ).status,
  ).toBe(400);
  const casing = request();
  casing.headers.set("Authorization", "bearer valid");
  expect((await f.handle(casing)).status).toBe(200);
  await f.server.close();
});

it.each([
  ["invalid_request", 400],
  ["invalid_token", 401],
  ["access_denied", 403],
  ["temporarily_unavailable", 503],
] as const)(
  "maps provider %s to HTTP %s in both eras",
  async (code, status) => {
    const f = setup(
      makeProvider(async () => {
        throw new AuthError(code, { cause: new Error("invalid-secret") });
      }),
    );
    for (const revision of [PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION]) {
      const response = await f.handle(request(revision));
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: code });
    }
    expect(f.execute).not.toHaveBeenCalled();
    await f.server.close();
  },
);

it("keeps provider outages private and authenticates before parsing the body", async () => {
  const f = setup(
    makeProvider(async () => {
      throw new Error("secret provider detail");
    }),
  );
  const req = request();
  const malformed = new Request(req.url, {
    method: "POST",
    headers: req.headers,
    body: "{",
  });
  const response = await f.handle(malformed);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "temporarily_unavailable" });
  await f.server.close();
});

it("uses a per-request resource without query parameters and supports an explicit override", async () => {
  const verify = vi.fn(async () => ({ userId: "alice" }));
  const f = setup(makeProvider(verify));
  for (const host of ["one.example.com", "two.example.com"]) {
    expect(
      (
        await f.handle(
          request(PROTOCOL_VERSION, "valid", `https://${host}/mcp?trace=1`),
        )
      ).status,
    ).toBe(200);
    expect(verify).toHaveBeenLastCalledWith(
      "valid",
      expect.objectContaining({ resource: `https://${host}/mcp` }),
    );
  }
  expect(
    (
      await f.handle(
        request(PROTOCOL_VERSION, "valid", "http://untrusted.example.com/mcp"),
      )
    ).status,
  ).toBe(400);
  const fixed = setup({
    ...makeProvider(verify),
    resource: "https://canonical.example.com/service/mcp",
  });
  expect((await fixed.handle(request())).status).toBe(200);
  expect(verify).toHaveBeenLastCalledWith(
    "valid",
    expect.objectContaining({
      resource: "https://canonical.example.com/service/mcp",
    }),
  );
  const challenge = await fixed.handle(request(PROTOCOL_VERSION, null));
  expect(challenge.headers.get("WWW-Authenticate")).toContain(
    "https://canonical.example.com/.well-known/oauth-protected-resource/service/mcp",
  );
  await Promise.all([f.server.close(), fixed.server.close()]);
});

it("checks endpoint policy before verification and disposes authorization after invalid bodies", async () => {
  const verify = vi.fn(async () => ({ userId: "alice" }));
  const f = setup(makeProvider(verify));
  const req = request();
  req.headers.set("Origin", "https://evil.example.com");
  expect((await f.handle(req)).status).toBe(403);
  expect((await f.handle(new Request(endpoint))).status).toBe(405);
  expect(verify).not.toHaveBeenCalled();
  const valid = request();
  expect(
    (
      await f.handle(
        new Request(endpoint, {
          method: "POST",
          headers: valid.headers,
          body: "{",
        }),
      )
    ).status,
  ).toBe(400);
  await f.server.close();
  expect((await f.handle(request())).status).toBe(503);
});

it("serves public GET and HEAD metadata at path-specific and root URLs", async () => {
  const f = setup();
  for (const suffix of ["/mcp", "", "/public/mcp", "/mcp/"]) {
    const url = `https://api.example.com/.well-known/oauth-protected-resource${suffix}`;
    const response = await f.metadata(new Request(url));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      resource: `https://api.example.com${suffix}`,
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
    });
    const head = await f.metadata(new Request(url, { method: "HEAD" }));
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    const post = await f.metadata(new Request(url, { method: "POST" }));
    expect(post.status).toBe(405);
    expect(post.headers.get("Allow")).toBe("GET, HEAD");
  }
  expect(
    (await f.metadata(new Request("https://api.example.com/wrong"))).status,
  ).toBe(404);
  expect(
    (
      await f.metadata(
        new Request(
          "http://bad.example.com/.well-known/oauth-protected-resource/mcp",
        ),
      )
    ).status,
  ).toBe(400);
  const fixed = setup({
    ...makeProvider(),
    resource: "https://canonical.example.com/mcp",
  });
  expect(
    (
      await fixed.metadata(
        new Request(
          "https://internal.example.com/.well-known/oauth-protected-resource/wrong",
        ),
      )
    ).status,
  ).toBe(404);
  expect(
    await (
      await fixed.metadata(
        new Request(
          "https://internal.example.com/.well-known/oauth-protected-resource/mcp",
        ),
      )
    ).json(),
  ).toHaveProperty("resource", "https://canonical.example.com/mcp");
  const plain = createServer({ name: "plain", version: "1", tools: {} });
  expect(() => createProtectedResourceMetadataHandler(plain)).toThrow(
    "auth-configured",
  );
  await Promise.all([f.server.close(), fixed.server.close(), plain.close()]);
});

it("aborts verification on disconnect and closes while reading a request body", async () => {
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const f = setup(
    makeProvider(async () => {
      started();
      return new Promise(() => {});
    }),
  );
  const controller = new AbortController();
  const pending = f.handle(
    new Request(request(), { signal: controller.signal }),
  );
  await ready;
  controller.abort(new Error("disconnect"));
  await expect(pending).rejects.toThrow("disconnect");
  await f.server.close();
  const reading = setup();
  const original = request();
  let bodyRead!: () => void;
  const pulled = new Promise<void>((resolve) => {
    bodyRead = resolve;
  });
  const body = new ReadableStream({
    pull() {
      bodyRead();
    },
  });
  const bodyPending = reading.handle(
    new Request(original.url, {
      method: "POST",
      headers: original.headers,
      body,
      duplex: "half",
    } as RequestInit),
  );
  await pulled;
  await Promise.resolve();
  await reading.server.close();
  expect((await bodyPending).status).toBe(503);
});
