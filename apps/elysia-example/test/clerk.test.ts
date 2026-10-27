import {
  LEGACY_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
  type SupportedProtocolVersion,
} from "@toolgrain/protocol";
import { exportJWK, generateKeyPair, type JWTPayload, SignJWT } from "jose";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const domain = "sample-app.clerk.accounts.dev";
const issuer = `https://${domain}`;
const endpoint = "http://127.0.0.1:3007/mcp";
const options = {
  publishableKey: `pk_test_${Buffer.from(`${domain}$`).toString("base64")}`,
  secretKey: "sk_test_example",
};
const key = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(key.publicKey)), alg: "RS256", kid: "test" };
function sign(claims: JWTPayload = {}, typ = "at+jwt") {
  return new SignJWT({
    iss: issuer,
    aud: endpoint,
    sub: "user_alice",
    client_id: "client_inspector",
    exp: Math.floor(Date.now() / 1000) + 300,
    scope: "openid profile",
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test", typ })
    .sign(key.privateKey);
}
function mockClerk() {
  const fetcher = vi.fn(
    async (address: string | URL | Request, init?: RequestInit) => {
      const url = String(address);
      if (
        url === "https://api.clerk.com/oauth_applications/access_tokens/verify"
      ) {
        const body = JSON.parse(String(init?.body)) as { access_token: string };
        return Response.json({
          object: "clerk_idp_oauth_access_token",
          id: "oat_test",
          client_id: "client_inspector",
          subject: "user_alice",
          scopes: ["openid", "profile"],
          revoked: body.access_token !== "oat_valid",
          revocation_reason: null,
          expired: false,
          expiration: Math.floor(Date.now() / 1000) + 300,
          created_at: 1,
          updated_at: 1,
          aud: [endpoint],
        });
      }
      if (url === `${issuer}/.well-known/jwks.json`)
        return Response.json({ keys: [jwk] });
      if (url === `${issuer}/.well-known/oauth-authorization-server`)
        return Response.json({
          issuer,
          jwks_uri: `${issuer}/.well-known/jwks.json`,
        });
      throw new Error(`Unexpected fixture request: ${url}`);
    },
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
function request(
  revision: SupportedProtocolVersion,
  token?: string,
  name = "whoAmI",
) {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": revision,
      "Mcp-Method": "tools/call",
      "Mcp-Name": name,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name,
        arguments: name === "greet" ? { name: "Ada" } : {},
        ...(revision === PROTOCOL_VERSION
          ? {
              _meta: {
                "io.modelcontextprotocol/protocolVersion": revision,
                "io.modelcontextprotocol/clientCapabilities": {},
              },
            }
          : {}),
      },
    }),
  });
}
let application: typeof import("../src/clerk.js");
let fetcher: ReturnType<typeof mockClerk>;

// Cold Clerk/Elysia imports can exceed five seconds on shared CI runners.
// Give setup its own budget while keeping request assertions at the default timeout.
beforeEach(async () => {
  fetcher = mockClerk();
  vi.stubEnv("CLERK_PUBLISHABLE_KEY", options.publishableKey);
  vi.stubEnv("CLERK_SECRET_KEY", options.secretKey);
  vi.stubEnv("MCP_RESOURCE", "");
  application = await import("../src/clerk.js");
}, 15000);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

it.each([PROTOCOL_VERSION, LEGACY_PROTOCOL_VERSION] as const)(
  "protects both tools and exposes Clerk JWT and opaque identities in %s",
  async (revision) => {
    const { app, server } = application;
    try {
      const metadata = await app.handle(
        new Request(
          "http://127.0.0.1:3007/.well-known/oauth-protected-resource/mcp",
        ),
      );
      expect(metadata.status).toBe(200);
      expect(await metadata.json()).toMatchObject({
        resource: endpoint,
        authorization_servers: [issuer],
      });
      for (const name of ["greet", "whoAmI"]) {
        const missing = await app.handle(request(revision, undefined, name));
        expect(missing.status).toBe(401);
        expect(missing.headers.get("WWW-Authenticate")).toContain(
          "/.well-known/oauth-protected-resource/mcp",
        );
      }
      expect(fetcher).not.toHaveBeenCalled();
      for (const token of [await sign(), "oat_valid"]) {
        const response = await app.handle(request(revision, token));
        expect(
          response.status,
          JSON.stringify(fetcher.mock.calls.map(([url]) => String(url))),
        ).toBe(200);
        const body = await response.json();
        expect(body).toHaveProperty("result.structuredContent", {
          userId: "user_alice",
          clientId: "client_inspector",
          scopes: ["openid", "profile"],
        });
        expect(JSON.stringify(body)).not.toContain(options.secretKey);
        expect(JSON.stringify(body)).not.toContain(token);
        const greet = await app.handle(request(revision, token, "greet"));
        expect(greet.status).toBe(200);
        expect(await greet.json()).toHaveProperty(
          "result.structuredContent.message",
          "Hello, Ada!",
        );
      }
      for (const token of [await sign({}, "JWT"), "oat_revoked"]) {
        const response = await app.handle(request(revision, token));
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "invalid_token" });
      }
      for (const [aud, detail] of [
        [undefined, "missing the aud claim"],
        [[], "does not match the expected resource"],
        ["http://localhost:3007/mcp", "does not match the expected resource"],
      ] as const) {
        const token = await sign({ aud } as unknown as JWTPayload);
        const req = request(revision, token);
        const discovery = new Request(req.url, {
          method: "POST",
          headers: {
            ...Object.fromEntries(req.headers),
            "Mcp-Method": "server/discover",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "server/discover",
            params: {},
          }),
        });
        const response = await app.handle(discovery);
        expect(response.status).toBe(401);
        const body = await response.json();
        expect(body).toMatchObject({
          error: "invalid_token",
          error_description: expect.stringContaining(detail),
        });
        expect(body.error_description).toContain(endpoint);
        expect(response.headers.get("WWW-Authenticate")).toContain(
          `error_description="${body.error_description}"`,
        );
        expect(JSON.stringify(body)).not.toContain(token);
      }
      expect(
        (
          await app.handle(
            new Request(
              "http://evil.example.com/.well-known/oauth-protected-resource/mcp",
            ),
          )
        ).status,
      ).toBe(403);
    } finally {
      await server.close();
    }
  },
);
