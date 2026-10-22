import { LEGACY_PROTOCOL_VERSION, PROTOCOL_VERSION } from "@toolgrain/protocol";
import { expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import {
  AuthError,
  type AuthProvider,
  createAuthAccessor,
  createServer,
  isAuthError,
  tool,
  toolContext,
  validateAuthUrl,
  validateTokenAudience,
} from "../src/index.js";
import { deferred, MemoryTransport } from "./memory.js";

const type = Symbol.for("test/auth");
const useAuth = createAuthAccessor<{
  userId: string;
  roles: string[];
  details: { active: boolean };
}>(type);
const identity = () => ({
  userId: "alice",
  roles: ["reader"],
  details: { active: true },
});
const auth = (
  verify: AuthProvider["verify"] = async () => identity(),
): AuthProvider => ({
  type,
  authorizationServers: ["https://auth.example.com"],
  verify,
});
const message = (modern = true) => ({
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
});
const authorize = (
  server: ReturnType<typeof createServer>,
  signal?: AbortSignal,
) =>
  server.authorize("secret-token", {
    resource: "https://api.example.com/mcp",
    ...(signal ? { signal } : {}),
  });

it.each([
  new Error("private provider outage"),
  new AuthError("temporarily_unavailable", {
    cause: new Error("private cause"),
  }),
  "non-Error provider failure",
])(
  "reports an unexpected auth failure once with no request details: %s",
  async (failure) => {
    const onError = vi.fn();
    const server = createServer({
      name: "diagnostics",
      version: "1",
      tools: {},
      onError,
      auth: auth(async () => {
        throw failure;
      }),
    });
    await expect(authorize(server)).rejects.toBe(failure);
    expect(onError.mock.calls).toEqual([[failure]]);
    await server.close();
  },
);

it.each(["invalid_request", "invalid_token", "access_denied"] as const)(
  "does not report expected auth rejection %s",
  async (code) => {
    const onError = vi.fn();
    const server = createServer({
      name: "expected",
      version: "1",
      tools: {},
      onError,
      auth: auth(async () => {
        throw new AuthError(code);
      }),
    });
    await expect(authorize(server)).rejects.toMatchObject({ code });
    expect(onError).not.toHaveBeenCalled();
    await server.close();
  },
);

it.each([false, true])(
  "isolates failing auth diagnostics (async: %s)",
  async (asyncCallback) => {
    const failure = new Error("provider failed");
    const callbackFailure = new Error("diagnostics failed");
    const onError = vi.fn(
      asyncCallback
        ? async () => {
            throw callbackFailure;
          }
        : () => {
            throw callbackFailure;
          },
    );
    const server = createServer({
      name: "diagnostics",
      version: "1",
      tools: {},
      onError,
      auth: auth(async () => {
        throw failure;
      }),
    });
    await expect(authorize(server)).rejects.toBe(failure);
    expect(onError.mock.calls).toEqual([[failure]]);
    await server.close();
  },
);

it.each(["cancel", "close"] as const)(
  "suppresses auth diagnostics after %s, including late provider failure",
  async (action) => {
    const pending = deferred<object>();
    const onError = vi.fn();
    const server = createServer({
      name: "cancel",
      version: "1",
      tools: {},
      onError,
      auth: auth(() => pending.promise),
    });
    const controller = new AbortController();
    const verifying = authorize(server, controller.signal);
    if (action === "cancel") controller.abort();
    else await server.close();
    await expect(verifying).rejects.toMatchObject({ name: "AbortError" });
    pending.reject(new Error("late provider outage"));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(onError).not.toHaveBeenCalled();
    await server.close();
  },
);

it.each([PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const)(
  "exposes a copied, deeply readonly identity for %s without changing standalone tools",
  async (protocolVersion) => {
    const original = identity();
    const seen: object[] = [];
    const who = tool({
      input: z.object({}),
      execute(_input, ctx) {
        const value = useAuth(ctx);
        expectTypeOf(value.userId).toEqualTypeOf<string>();
        expectTypeOf(value.roles).toEqualTypeOf<readonly string[]>();
        expect(Object.isFrozen(value)).toBe(true);
        expect(Object.isFrozen(value.roles)).toBe(true);
        expect(Object.isFrozen(value.details)).toBe(true);
        expect(JSON.stringify(ctx)).not.toContain("secret-token");
        expect(JSON.stringify(ctx)).not.toContain("alice");
        seen.push(value);
        return value.userId;
      },
    });
    const server = createServer({
      name: "auth",
      version: "1",
      auth: auth(async () => original),
      tools: { who },
    });
    for (let n = 0; n < 2; n++) {
      const scope = await authorize(server);
      expect(
        await server.handle(message(protocolVersion === PROTOCOL_VERSION), {
          protocolVersion,
          auth: scope,
        }),
      ).toHaveProperty("result.content.0.text", "alice");
      await expect(
        server.handle(message(), { auth: scope }),
      ).rejects.toMatchObject({ code: "invalid_token" });
      scope.dispose();
      scope.dispose();
    }
    expect(seen[0]).not.toBe(original);
    expect(seen[0]).not.toBe(seen[1]);
    original.roles.push("admin");
    expect(seen[0]).toHaveProperty("roles", ["reader"]);
    await server.close();
  },
);

it("rejects missing, forged, disposed, reused and other-server authorizations before dispatch", async () => {
  const server = createServer({
    name: "auth",
    version: "1",
    tools: {},
    auth: auth(),
  });
  const other = createServer({
    name: "other",
    version: "1",
    tools: {},
    auth: auth(),
  });
  await expect(server.handle({})).rejects.toBeInstanceOf(AuthError);
  await expect(
    server.handle(message(), {
      auth: { signal: new AbortController().signal, dispose() {} },
    }),
  ).rejects.toBeInstanceOf(AuthError);
  const scope = await authorize(server);
  await expect(other.handle(message(), { auth: scope })).rejects.toBeInstanceOf(
    AuthError,
  );
  scope.dispose();
  await expect(
    server.handle(message(), { auth: scope }),
  ).rejects.toBeInstanceOf(AuthError);
  const plain = createServer({ name: "plain", version: "1", tools: {} });
  await expect(authorize(plain)).rejects.toThrow("no auth provider");
  await expect(plain.handle(message(), { auth: scope })).rejects.toBeInstanceOf(
    AuthError,
  );
  await Promise.all([server.close(), other.close(), plain.close()]);
});

it("rejects absent or mismatched auth accessors and interoperates across package copies", async () => {
  expect(() => useAuth(toolContext())).toThrow("no identity");
  vi.resetModules();
  const { createAuthAccessor: copyAccessor } = await import(
    "../src/auth/context.js"
  );
  const readCopy = copyAccessor<{ userId: string }>(type);
  const server = createServer({
    name: "copies",
    version: "1",
    auth: auth(),
    tools: {
      who: tool({
        input: z.object({}),
        execute(_input, ctx) {
          expect(() => createAuthAccessor(Symbol.for("other"))(ctx)).toThrow(
            "no identity",
          );
          return readCopy(ctx).userId;
        },
      }),
    },
  });
  const scope = await authorize(server);
  expect(await server.handle(message(), { auth: scope })).toHaveProperty(
    "result.content.0.text",
    "alice",
  );
  scope.dispose();
  const { AuthError: CopyError } = await import("../src/auth/errors.js");
  expect(isAuthError(new CopyError("invalid_token"))).toBe(true);
  expect(isAuthError({})).toBe(false);
  expect(isAuthError(new Error("failure"))).toBe(false);
  await server.close();
});

it("snapshots metadata and passes the explicit resource to verification", async () => {
  const verify = vi.fn(async () => identity());
  const provider = { ...auth(verify), resource: "https://api.example.com" };
  const server = createServer({
    name: "metadata",
    version: "1",
    tools: {},
    auth: provider,
  });
  provider.authorizationServers = ["https://changed.example.com"];
  provider.resource = "https://changed.example.com";
  const metadata = server.getAuthMetadata();
  expect(metadata).toEqual({
    resource: "https://api.example.com",
    authorizationServers: ["https://auth.example.com"],
  });
  if (!metadata) throw new Error("Expected auth metadata");
  (metadata.authorizationServers as string[]).push("changed");
  expect(server.getAuthMetadata()?.authorizationServers).toHaveLength(1);
  const scope = await authorize(server);
  expect(verify).toHaveBeenCalledWith(
    "secret-token",
    expect.objectContaining({ resource: "https://api.example.com" }),
  );
  scope.dispose();
  await expect(server.listen(new MemoryTransport())).rejects.toThrow(
    "require HTTP",
  );
  await server.close();
});

it("cancels verification promptly, ignores late results, and aborts scopes on close", async () => {
  const wait = deferred();
  let providerSignal: AbortSignal | undefined;
  const server = createServer({
    name: "cancel",
    version: "1",
    tools: {},
    auth: auth(async (_token, { signal }) => {
      providerSignal = signal;
      await wait.promise;
      return identity();
    }),
  });
  const cancel = new AbortController();
  const pending = authorize(server, cancel.signal);
  cancel.abort(new Error("disconnect"));
  await expect(pending).rejects.toThrow("disconnect");
  expect(providerSignal?.aborted).toBe(true);
  const closing = authorize(server);
  await server.close();
  await expect(closing).rejects.toMatchObject({ name: "AbortError" });
  await expect(authorize(server)).rejects.toMatchObject({
    code: "temporarily_unavailable",
  });
  wait.resolve();

  const active = createServer({
    name: "active",
    version: "1",
    tools: {},
    auth: auth(),
  });
  const scope = await authorize(active);
  const alreadyCancelled = new AbortController();
  alreadyCancelled.abort();
  await expect(
    authorize(active, alreadyCancelled.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  await active.close();
  expect(scope.signal.aborted).toBe(true);
  scope.dispose();
});

it("suppresses a call whose authorization signal was aborted", async () => {
  const server = createServer({
    name: "cancel",
    version: "1",
    tools: {},
    auth: auth(),
  });
  const cancel = new AbortController();
  const scope = await authorize(server, cancel.signal);
  cancel.abort();
  expect(await server.handle(message(), { auth: scope })).toBeUndefined();
  scope.dispose();
  await server.close();
});

it("rejects invalid providers and non-data identities", async () => {
  for (const provider of [
    { ...auth(), type: "wrong" as unknown as symbol },
    { ...auth(), authorizationServers: [] },
    { ...auth(), authorizationServers: ["bad"] },
  ])
    expect(() =>
      createServer({ name: "bad", version: "1", tools: {}, auth: provider }),
    ).toThrow();
  for (const value of [
    new Date(),
    { date: new Date() },
    null,
    "bad",
    { method() {} },
  ]) {
    const server = createServer({
      name: "bad",
      version: "1",
      tools: {},
      auth: auth(async () => value as object),
    });
    await expect(authorize(server)).rejects.toThrow();
    await server.close();
  }
  const cyclic: { self?: object } = {};
  cyclic.self = cyclic;
  const server = createServer({
    name: "cycle",
    version: "1",
    tools: {},
    auth: auth(async () => ({ cyclic, nullable: null })),
  });
  const scope = await authorize(server);
  scope.dispose();
  await server.close();
});

it.each([
  "https://api.example.com/mcp",
  "http://localhost:3000/mcp",
  "http://127.0.0.1/mcp",
  "http://[::1]/mcp",
])("accepts trusted auth URL %s", (value) =>
  expect(validateAuthUrl(value)).toBe(value),
);
it.each([
  "/mcp",
  "http://api.example.com/mcp",
  "ftp://localhost/mcp",
  "https://user:password@api.example.com",
  "https://api.example.com#fragment",
  "https://api.example.com?token=x",
  "https://api.example.com#",
  "https://api.example.com?",
  "https:api.example.com",
  "https:///api.example.com",
  "https://api.example.com/white space",
  "https://api.example.com/\n",
])("rejects invalid auth URL %s", (value) =>
  expect(() => validateAuthUrl(value)).toThrow(),
);

it("validates verified-token audiences and gives public descriptions without token claims", () => {
  const resource = "https://api.example.com/mcp";
  for (const audience of [resource, ["other", resource]])
    expect(() => validateTokenAudience(audience, resource)).not.toThrow();
  for (const [audience, detail] of [
    [undefined, "missing the aud claim"],
    [[], "does not match the expected resource"],
    ["", "does not match the expected resource"],
    ["private-audience", "does not match the expected resource"],
    [["private-audience"], "does not match the expected resource"],
  ] as const) {
    let error: unknown;
    try {
      validateTokenAudience(audience, resource);
    } catch (failure) {
      error = failure;
    }
    expect(isAuthError(error)).toBe(true);
    if (!isAuthError(error)) throw new Error("Expected AuthError");
    expect(error.code).toBe("invalid_token");
    expect(error.description).toContain(detail);
    expect(error.description).toContain(resource);
    expect(error.description).not.toContain("private-audience");
    expect(error.message).toBe(error.description);
  }
  for (const audience of [null, 1, {}, [resource, 1]])
    expect(() => validateTokenAudience(audience, resource)).toThrow(
      "Invalid access token",
    );
});

it("retains private causes separately from explicit public descriptions across package copies", async () => {
  const { AuthError: CopyError } = await import("../src/auth/errors.js");
  const cause = new Error("private provider response");
  const error = new CopyError("invalid_token", {
    description: "Public guidance",
    cause,
  });
  expect(isAuthError(error)).toBe(true);
  expect(error.message).toBe("Public guidance");
  expect(error.description).toBe("Public guidance");
  expect(error.cause).toBe(cause);
  expectTypeOf(error.description).toEqualTypeOf<string | undefined>();
});
