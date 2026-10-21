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
