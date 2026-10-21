import { createAuthAccessor, createServer, tool } from "@toolgrain/mcp";
import {
  base64url,
  CompactSign,
  errors,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  SignJWT,
} from "jose";
import { afterEach, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { discoverJwks, fetchJson } from "../src/discovery.js";
import { jwt, useAuth } from "../src/index.js";

const issuer = "https://auth.example.com";
const resource = "https://api.example.com/mcp";
const jwksUrl = `${issuer}/keys`;
const key = await generateKeyPair("RS256");
const publicJwk = {
  ...(await exportJWK(key.publicKey)),
  kid: "one",
  alg: "RS256",
  use: "sig",
};
const now = () => Math.floor(Date.now() / 1000);
const sign = (
  claims: JWTPayload = {},
  privateKey = key.privateKey,
  kid = "one",
) =>
  new SignJWT({
    iss: issuer,
    aud: resource,
    exp: now() + 300,
    sub: "alice",
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid })
    .sign(privateKey);
const verifyOptions = () => ({
  resource,
  signal: new AbortController().signal,
});
function mockFetch() {
  const fetcher = vi.fn(async (url: string | URL | Request) => {
    if (String(url) === jwksUrl) return Response.json({ keys: [publicJwk] });
    return Response.json({ issuer, jwks_uri: jwksUrl });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("discovers keys, validates the audience, and infers auth from a standalone tool", async () => {
  const fetcher = mockFetch();
  const provider = jwt({ issuer });
  const identity = await provider.verify(
    await sign({ custom: { plan: "free" } }),
    verifyOptions(),
  );
  expect(identity.claims.sub).toBe("alice");
  const server = createServer({
    name: "jwt",
    version: "1",
    auth: provider,
    tools: {
      who: tool({
        input: z.object({}),
        execute(_input, ctx) {
          const { claims } = useAuth(ctx);
          expectTypeOf(claims.sub).toEqualTypeOf<string | undefined>();
          expectTypeOf(claims.exp).toEqualTypeOf<number>();
          expectTypeOf(claims.custom).toEqualTypeOf<unknown>();
          expect(() => createAuthAccessor(Symbol.for("wrong"))(ctx)).toThrow();
          return claims.sub ?? null;
        },
      }),
    },
  });
  const scope = await server.authorize(await sign(), { resource });
  expect(
    await server.handle(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "who" } },
      { protocolVersion: "2025-06-18", auth: scope },
    ),
  ).toHaveProperty("result.content.0.text", "alice");
  scope.dispose();
  expect(fetcher).toHaveBeenCalledTimes(2);
  await server.close();
});

it("uses explicit keys and resources and snapshots options", async () => {
  const fetcher = mockFetch();
  const options = { issuer, jwksUrl, resource, algorithms: ["RS256"] };
  const provider = jwt(options);
  options.algorithms.splice(0);
  options.issuer = "https://changed.example.com";
  expect(
    (
      await provider.verify(await sign({ aud: [resource, "other"] }), {
        ...verifyOptions(),
        resource: "other",
      })
    ).claims.aud,
  ).toEqual([resource, "other"]);
  expect(fetcher).toHaveBeenCalledOnce();
});

it.each([
  { exp: 1 },
  { nbf: 9999999999 },
  { exp: undefined },
  { iss: "https://evil.example.com" },
  { aud: "other" },
  { aud: undefined },
  { sub: 1 },
  { jti: 1 },
  { iat: "bad" },
])("rejects invalid or mistyped standard claims %j", async (claims) => {
  mockFetch();
  await expect(
    jwt({ issuer }).verify(await sign(claims as JWTPayload), verifyOptions()),
  ).rejects.toMatchObject({ code: "invalid_token" });
});

it("rejects bad signatures, unknown keys, malformed tokens and disallowed algorithms", async () => {
  mockFetch();
  const provider = jwt({ issuer });
  const wrong = await generateKeyPair("RS256");
  for (const token of [
    "not.a.jwt",
    await sign({}, wrong.privateKey),
    await sign({}, key.privateKey, "unknown"),
    await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .sign(new Uint8Array(32)),
  ])
    await expect(provider.verify(token, verifyOptions())).rejects.toMatchObject(
      { code: "invalid_token" },
    );
});

it("shares concurrent discovery, refreshes metadata, and rotates keys after the JWKS cooldown", async () => {
  const fetcher = mockFetch();
  const provider = jwt({ issuer });
  const token = await sign();
  await Promise.all([
    provider.verify(token, verifyOptions()),
    provider.verify(token, verifyOptions()),
  ]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  const rotated = await generateKeyPair("RS256");
  const next = {
    ...(await exportJWK(rotated.publicKey)),
    kid: "two",
    alg: "RS256",
  };
  fetcher.mockImplementation(async (url) =>
    String(url) === jwksUrl
      ? Response.json({ keys: [next] })
      : Response.json({ issuer, jwks_uri: jwksUrl }),
  );
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + 31000);
  expect(
    (
      await provider.verify(
        await sign({}, rotated.privateKey, "two"),
        verifyOptions(),
      )
    ).claims.sub,
  ).toBe("alice");
  expect(fetcher).toHaveBeenCalledTimes(3);
  vi.setSystemTime(Date.now() + 600001);
  await provider.verify(
    await sign({}, rotated.privateKey, "two"),
    verifyOptions(),
  );
  expect(fetcher).toHaveBeenCalledTimes(5);
});

it("falls back through standard discovery URLs for path issuers", async () => {
  const pathIssuer = `${issuer}/tenant`;
  const fetcher = vi.fn(async (url: string) =>
    url.endsWith("/tenant/.well-known/openid-configuration")
      ? Response.json({ issuer: pathIssuer, jwks_uri: jwksUrl })
      : new Response(null, { status: 404 }),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(await discoverJwks(pathIssuer)).toBe(jwksUrl);
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    `${issuer}/.well-known/oauth-authorization-server/tenant`,
    `${issuer}/.well-known/openid-configuration/tenant`,
    `${issuer}/tenant/.well-known/openid-configuration`,
  ]);
  fetcher.mockImplementation(async () => new Response(null, { status: 405 }));
  await expect(discoverJwks(issuer)).rejects.toMatchObject({
    code: "temporarily_unavailable",
  });
});

it("preserves a path issuer's trailing slash for inserted discovery URLs", async () => {
  const pathIssuer = `${issuer}/tenant/`;
  const fetcher = vi.fn(async () =>
    Response.json({ issuer: pathIssuer, jwks_uri: jwksUrl }),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(await discoverJwks(pathIssuer)).toBe(jwksUrl);
  expect(fetcher).toHaveBeenCalledWith(
    `${issuer}/.well-known/oauth-authorization-server/tenant/`,
    expect.anything(),
  );
});

it.each([
  { issuer: "https://wrong.example.com", jwks_uri: jwksUrl },
  { issuer },
  null,
  { issuer, jwks_uri: "http://evil.example.com/keys" },
])("rejects invalid discovery metadata %j", async (metadata) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(metadata)),
  );
  await expect(
    jwt({ issuer }).verify(await sign(), verifyOptions()),
  ).rejects.toMatchObject({ code: "temporarily_unavailable" });
});

it("retries discovery after failures and classifies network and key-service failures as unavailable", async () => {
  const fetcher = mockFetch();
  const provider = jwt({ issuer });
  const token = await sign();
  fetcher.mockRejectedValueOnce(new TypeError("network"));
  await expect(provider.verify(token, verifyOptions())).rejects.toMatchObject({
    code: "temporarily_unavailable",
  });
  await expect(provider.verify(token, verifyOptions())).resolves.toHaveProperty(
    "claims.sub",
    "alice",
  );
  for (const response of [
    new Response(null, { status: 500 }),
    new Response(null, {
      status: 302,
      headers: { Location: "https://evil.example.com" },
    }),
    Response.json({ keys: "invalid" }),
    new Response("{not-json"),
  ]) {
    fetcher.mockResolvedValue(response);
    await expect(
      jwt({ issuer, jwksUrl }).verify(token, verifyOptions()),
    ).rejects.toMatchObject({ code: "temporarily_unavailable" });
  }
});

it("bounds metadata and key bodies and respects cancellation", async () => {
  const fetcher = mockFetch();
  fetcher.mockResolvedValue(new Response("x".repeat(65537)));
  await expect(discoverJwks(issuer)).rejects.toMatchObject({
    code: "temporarily_unavailable",
  });
  fetcher.mockResolvedValue(new Response(null));
  await expect(
    fetchJson(jwksUrl, new AbortController().signal),
  ).rejects.toMatchObject({ code: "temporarily_unavailable" });
  const cancelled = new AbortController();
  cancelled.abort();
  await expect(
    jwt({ issuer }).verify("token", { resource, signal: cancelled.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  const provider = jwt({ issuer, jwksUrl });
  const token = await sign();
  const later = new AbortController();
  fetcher.mockImplementation(async () => {
    later.abort();
    return Response.json({ keys: [publicJwk] });
  });
  await expect(
    provider.verify(token, { resource, signal: later.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
});

it.each([
  { algorithms: [] },
  { algorithms: ["HS256"] },
  { algorithms: ["none"] },
  { algorithms: ["unknown"] },
])("rejects unsafe algorithm configuration %j", ({ algorithms }) =>
  expect(() => jwt({ issuer, algorithms })).toThrow("asymmetric"),
);
it("reports an interrupted key response even when cancelling the reader also fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error("body failed"));
            },
          }),
        ),
    ),
  );
  await expect(
    jwt({ issuer, jwksUrl }).verify(await sign(), verifyOptions()),
  ).rejects.toMatchObject({ code: "temporarily_unavailable" });
});
it("validates issuer, key and resource configuration", () => {
  expect(() => jwt({ issuer: "bad" })).toThrow();
  expect(() => jwt({ issuer, jwksUrl: "bad" })).toThrow();
  expect(() => jwt({ issuer, resource: "/mcp" })).toThrow();
});

it.each([42, null, {}, ["nested"]])(
  "rejects a matching audience array containing a non-string value %j",
  async (value) => {
    mockFetch();
    const token = await sign({
      aud: [resource, value],
    } as unknown as JWTPayload);
    await expect(
      jwt({ issuer }).verify(token, verifyOptions()),
    ).rejects.toMatchObject({ code: "invalid_token" });
  },
);
it("rejects a correctly signed JSON expiration that overflows to Infinity", async () => {
  mockFetch();
  const payload = JSON.stringify({
    iss: issuer,
    aud: resource,
    exp: 0,
  }).replace('"exp":0', '"exp":1e400');
  const token = await new CompactSign(new TextEncoder().encode(payload))
    .setProtectedHeader({ alg: "RS256", kid: "one" })
    .sign(key.privateKey);
  await expect(
    jwt({ issuer }).verify(token, verifyOptions()),
  ).rejects.toMatchObject({ code: "invalid_token" });
});
it("classifies unsupported critical JWT headers as invalid tokens rather than provider outages", async () => {
  mockFetch();
  const token = [
    base64url.encode(
      JSON.stringify({
        alg: "RS256",
        kid: "one",
        crit: ["unsupported"],
        unsupported: true,
      }),
    ),
    base64url.encode(
      JSON.stringify({ iss: issuer, aud: resource, exp: now() + 300 }),
    ),
    "AAAA",
  ].join(".");
  await expect(
    jwt({ issuer }).verify(token, verifyOptions()),
  ).rejects.toMatchObject({
    code: "invalid_token",
    cause: { code: "ERR_JOSE_NOT_SUPPORTED" },
  });
});

it("preserves provider-outage classification when trusted key import is unsupported", async () => {
  mockFetch();
  const token = await sign();
  const unsupported = new errors.JOSENotSupported("review key import failure");
  const importKey = vi
    .spyOn(crypto.subtle, "importKey")
    .mockRejectedValueOnce(unsupported);
  try {
    await expect(
      jwt({ issuer }).verify(token, verifyOptions()),
    ).rejects.toMatchObject({
      code: "temporarily_unavailable",
      cause: unsupported,
    });
    expect(importKey).toHaveBeenCalledOnce();
  } finally {
    importKey.mockRestore();
  }
});

it.each([
  [undefined, "missing the aud claim"],
  [[], "does not match the expected resource"],
  ["private-audience", "does not match the expected resource"],
  [["private-audience"], "does not match the expected resource"],
] as const)(
  "explains verified JWT audience failures %j",
  async (aud, detail) => {
    mockFetch();
    for (const explicit of [false, true]) {
      const provider = jwt({ issuer, ...(explicit ? { resource } : {}) });
      const token = await sign({ aud } as unknown as JWTPayload);
      await expect(
        provider.verify(token, {
          ...verifyOptions(),
          ...(explicit ? { resource: "https://internal.example.com/mcp" } : {}),
        }),
      ).rejects.toMatchObject({
        code: "invalid_token",
        description: expect.stringContaining(detail),
        message: expect.stringContaining(resource),
      });
      try {
        await provider.verify(token, verifyOptions());
      } catch (error) {
        expect(String(error)).not.toContain(token);
        expect(String(error)).not.toContain("private-audience");
        expect(String(error)).not.toContain("internal.example.com");
      }
    }
  },
);

it("does not expose audience diagnostics for a token whose signature is invalid", async () => {
  mockFetch();
  const wrong = await generateKeyPair("RS256");
  const token = await sign(
    { aud: undefined } as unknown as JWTPayload,
    wrong.privateKey,
  );
  await expect(
    jwt({ issuer }).verify(token, verifyOptions()),
  ).rejects.toMatchObject({
    code: "invalid_token",
    description: undefined,
    cause: { code: "ERR_JWS_SIGNATURE_VERIFICATION_FAILED" },
  });
});
