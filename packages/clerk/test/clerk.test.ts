import { createServer, tool } from "@toolgrain/mcp";
import { exportJWK, generateKeyPair, type JWTPayload, SignJWT } from "jose";
import { afterEach, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { clerk, useAuth } from "../src/index.js";

const domain = "sample-app.clerk.accounts.dev";
const issuer = `https://${domain}`;
const resource = "https://api.example.com/mcp";
const options = {
  publishableKey: `pk_test_${Buffer.from(`${domain}$`).toString("base64")}`,
  secretKey: "sk_test_example",
};
const key = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(key.publicKey)), alg: "RS256", kid: "one" };
const verifyOptions = () => ({
  resource,
  signal: new AbortController().signal,
});
const sign = (claims: JWTPayload = {}, typ = "at+jwt") =>
  new SignJWT({
    iss: issuer,
    aud: resource,
    exp: Math.floor(Date.now() / 1000) + 300,
    sub: "user_alice",
    client_id: "client_one",
    scope: "profile email",
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "one", typ })
    .sign(key.privateKey);
const opaque = (changes: Record<string, unknown> = {}) => ({
  object: "clerk_idp_oauth_access_token",
  id: "oat_one",
  client_id: "client_one",
  type: "oauth_token",
  subject: "user_alice",
  scopes: ["profile"],
  revoked: false,
  revocation_reason: null,
  expired: false,
  expiration: Math.floor(Date.now() / 1000) + 300,
  created_at: 1,
  updated_at: 1,
  aud: [resource],
  ...changes,
});
function mockFetch(data = opaque()) {
  const fetcher = vi.fn(
    async (address: string | URL | Request, _init?: RequestInit) => {
      const url = String(address);
      if (new URL(url).hostname === "api.clerk.com") return Response.json(data);
      if (url.endsWith("/keys")) return Response.json({ keys: [jwk] });
      return Response.json({ issuer, jwks_uri: `${issuer}/keys` });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
afterEach(() => vi.unstubAllGlobals());

it("derives the issuer, verifies an OAuth JWT, and exposes a plain typed identity", async () => {
  const fetcher = mockFetch();
  const provider = clerk(options);
  expect(provider.authorizationServers).toEqual([issuer]);
  const token = await sign();
  expect(await provider.verify(token, verifyOptions())).toEqual({
    userId: "user_alice",
    clientId: "client_one",
    scopes: ["profile", "email"],
  });
  const server = createServer({
    name: "clerk",
    version: "1",
    auth: provider,
    tools: {
      who: tool({
        input: z.object({}),
        execute(_input, ctx) {
          const identity = useAuth(ctx);
          expectTypeOf(identity.userId).toEqualTypeOf<string>();
          expectTypeOf(identity.scopes).toEqualTypeOf<readonly string[]>();
          expect(identity).not.toHaveProperty("getToken");
          expect(Object.isFrozen(identity.scopes)).toBe(true);
          return identity;
        },
      }),
    },
  });
  const scope = await server.authorize(token, { resource });
  expect(
    await server.handle(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "who" } },
      { protocolVersion: "2025-06-18", auth: scope },
    ),
  ).toHaveProperty("result.structuredContent.userId", "user_alice");
  scope.dispose();
  expect(
    fetcher.mock.calls.every(
      ([url]) => new URL(String(url)).hostname !== "api.clerk.com",
    ),
  ).toBe(true);
  await server.close();
});

it("verifies opaque OAuth tokens with Clerk and validates their audience", async () => {
  const fetcher = mockFetch();
  const provider = clerk({ ...options, resource });
  expect(
    await provider.verify("oat_valid", {
      ...verifyOptions(),
      resource: "other",
    }),
  ).toEqual({
    userId: "user_alice",
    clientId: "client_one",
    scopes: ["profile"],
  });
  expect(fetcher.mock.calls[0]?.[0]).toContain(
    "/oauth_applications/access_tokens/verify",
  );
  const request = fetcher.mock.calls[0]?.[1];
  expect(String(request?.body)).toContain("oat_valid");
  expect(new Headers(request?.headers).get("Authorization")).toBe(
    "Bearer sk_test_example",
  );
  for (const aud of [undefined, ["other"]]) {
    fetcher.mockResolvedValue(Response.json(opaque({ aud })));
    await expect(
      provider.verify("oat_wrong", verifyOptions()),
    ).rejects.toMatchObject({ code: "invalid_token" });
  }
});

it.each([
  { revoked: true },
  { expired: true },
  { type: "session" },
  { subject: "mch_robot" },
  { client_id: "" },
])("rejects unusable opaque identities %j", async (changes) => {
  mockFetch(opaque(changes));
  await expect(
    clerk(options).verify("oat_bad", verifyOptions()),
  ).rejects.toMatchObject({ code: "invalid_token" });
});

it("accepts the OAuth header variants, scp arrays and an absent scope", async () => {
  mockFetch();
  const provider = clerk(options);
  expect(
    (
      await provider.verify(
        await sign({ scp: ["custom"], scope: undefined }, "application/at+jwt"),
        verifyOptions(),
      )
    ).scopes,
  ).toEqual(["custom"]);
  expect(
    (await provider.verify(await sign({ scope: undefined }), verifyOptions()))
      .scopes,
  ).toEqual([]);
});

it.each([
  { sub: "mch_robot" },
  { sub: undefined },
  { client_id: undefined },
  { client_id: "" },
  { scope: 1 },
  { scp: [1] },
  { scp: "bad" },
  { aud: undefined },
  { aud: [] },
  { aud: "other" },
  { iss: "https://wrong.example.com" },
  { exp: 1 },
])("rejects invalid OAuth JWT claims %j", async (claims) => {
  mockFetch();
  await expect(
    clerk(options).verify(await sign(claims as JWTPayload), verifyOptions()),
  ).rejects.toMatchObject({ code: "invalid_token" });
});

it("rejects session JWTs, malformed JWTs, API keys and M2M tokens without token verification", async () => {
  const fetcher = mockFetch();
  const provider = clerk(options);
  for (const token of [
    await sign({}, "JWT"),
    "bad",
    "ak_api-key",
    "mt_machine-token",
  ])
    await expect(provider.verify(token, verifyOptions())).rejects.toMatchObject(
      { code: "invalid_token" },
    );
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([
  [400, "invalid_token"],
  [404, "invalid_token"],
  [422, "invalid_token"],
  [403, "access_denied"],
  [401, "temporarily_unavailable"],
])("classifies Clerk HTTP %s as %s", async (status, code) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { errors: [{ code: "test", message: "private diagnostic" }] },
        { status: status as number },
      ),
    ),
  );
  await expect(
    clerk(options).verify("oat_invalid", verifyOptions()),
  ).rejects.toMatchObject({ code });
});

it("cancels opaque verification without returning a late identity", async () => {
  const fetcher = mockFetch();
  const cancelled = new AbortController();
  cancelled.abort();
  await expect(
    clerk(options).verify("oat_valid", { resource, signal: cancelled.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  const later = new AbortController();
  fetcher.mockImplementation(async () => {
    later.abort();
    return Response.json(opaque());
  });
  await expect(
    clerk(options).verify("oat_valid", { resource, signal: later.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
});

it("rejects malformed local configuration", () => {
  expect(() => clerk({ ...options, publishableKey: "bad" })).toThrow();
  expect(() => clerk({ ...options, secretKey: "" })).toThrow("secret key");
  expect(() => clerk({ ...options, resource: "/mcp" })).toThrow();
});

it.each([
  [undefined, "missing the aud claim"],
  [[], "does not match the expected resource"],
  [["private-audience"], "does not match the expected resource"],
] as const)(
  "explains audience failures consistently for Clerk JWT and opaque tokens %j",
  async (aud, detail) => {
    mockFetch(opaque({ aud }));
    const provider = clerk({ ...options, resource });
    for (const token of [
      await sign({ aud } as unknown as JWTPayload),
      "oat_wrong",
    ]) {
      await expect(
        provider.verify(token, {
          ...verifyOptions(),
          resource: "https://internal.example.com/mcp",
        }),
      ).rejects.toMatchObject({
        code: "invalid_token",
        description: expect.stringContaining(detail),
        message: expect.stringContaining(resource),
      });
    }
  },
);

it("does not explain the audience of revoked or malformed opaque tokens", async () => {
  const fetcher = mockFetch(opaque({ aud: undefined, revoked: true }));
  const provider = clerk(options);
  await expect(
    provider.verify("oat_revoked", verifyOptions()),
  ).rejects.toMatchObject({ code: "invalid_token", description: undefined });
  fetcher.mockResolvedValue(Response.json(opaque({ aud: [resource, 1] })));
  await expect(
    provider.verify("oat_malformed", verifyOptions()),
  ).rejects.toMatchObject({ code: "invalid_token", description: undefined });
});
