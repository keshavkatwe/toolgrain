# HTTP authorization

Configure authorization on `createServer({ auth })`. Tools remain standalone and
read the verified identity using their integration's synchronous `useAuth(ctx)`.
The API is the same for MCP `2026-07-28` and `2025-06-18`.

## JWT

```ts
// tools/who-am-i.ts
import { useAuth } from "@toolgrain/jwt";
import { tool } from "@toolgrain/mcp";
import { z } from "zod";

export const whoAmI = tool({
  input: z.object({}),
  execute(_input, ctx) {
    const { claims } = useAuth(ctx);
    return {
      subject: claims.sub ?? null,
      issuer: claims.iss,
      expiresAt: claims.exp,
    };
  },
});
```

```ts
// server.ts
import { jwt } from "@toolgrain/jwt";
import { createServer } from "@toolgrain/mcp";
import { whoAmI } from "./tools/who-am-i.js";

export const server = createServer({
  name: "jwt-example",
  version: "1.0.0",
  auth: jwt({ issuer: process.env.JWT_ISSUER! }),
  tools: { whoAmI },
});
```

`JWT_ISSUER` is an application-defined environment variable containing your
authorization provider's exact issuer identifier. Toolgrain discovers `jwks_uri`
through OAuth authorization server metadata or OpenID Connect discovery, checking
that the document's issuer matches the configured issuer. Path issuers use the
standard discovery URL variants. `jwksUrl` is an optional explicit override for
issuers without discovery. Metadata retrieval is bounded by size and time and
does not follow redirects.

Verification uses `jose`, with cached discovery and remote signing keys, including
key rotation. The defaults allow RS256 and ES256. Override `algorithms` with
supported asymmetric algorithms; symmetric algorithms and `none` are rejected.
Tokens require a valid signature, the configured issuer, a matching resource
audience, and `exp`. Expiration and any `nbf` are checked. Standard claim types
are checked before exposure. `iss`, `aud`, and `exp` are required; `sub`, `iat`,
`nbf`, and `jti` are optional. Other claims have type `unknown`.

JWT verification does not issue tokens or implement login, consent, OAuth client
registration, or an authorization server. Use an OAuth provider supporting your
MCP clients' authorization and registration flows.

## Clerk

```ts
// tools/who-am-i.ts
import { useAuth } from "@toolgrain/clerk";
import { tool } from "@toolgrain/mcp";
import { z } from "zod";

export const whoAmI = tool({
  input: z.object({}),
  execute(_input, ctx) {
    const auth = useAuth(ctx);
    return {
      userId: auth.userId,   // string
      clientId: auth.clientId, // string
      scopes: auth.scopes,   // readonly string[]
    };
  },
});
```

```ts
// server.ts
import { clerk } from "@toolgrain/clerk";
import { createServer } from "@toolgrain/mcp";
import { whoAmI } from "./tools/who-am-i.js";

export const server = createServer({
  name: "clerk-example",
  version: "1.0.0",
  auth: clerk({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY!,
    secretKey: process.env.CLERK_SECRET_KEY!,
  }),
  tools: { whoAmI },
});
```

Get both keys from the same Clerk application/environment's API keys page. No
`CLERK_ISSUER` variable is needed: the publishable key identifies the Frontend API
and its issuer. Configure OAuth applications and client onboarding in Clerk for
the MCP clients you intend to support. See [Clerk's OAuth guide](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth).

Only OAuth access tokens for your resource are accepted. JWT OAuth tokens are
verified against the Clerk issuer's signing keys; opaque `oat_` tokens are
verified with Clerk's backend SDK and checked for audience, revocation, and
expiration. Session tokens, API keys, and M2M tokens are rejected. The context
contains plain identity data; credentials and SDK token-getter methods are not
exposed. Scopes are available to application code but Toolgrain v0 does not
implement per-tool scope policies.

## HTTP mounting and resource inference

`createHttpHandler(server)` returns `(request: Request) => Promise<Response>`.
`createProtectedResourceMetadataHandler(server)` returns a separate public
GET/HEAD handler. Mount it at the standard well-known path for your MCP endpoint:

```ts
import {
  createHttpHandler,
  createProtectedResourceMetadataHandler,
} from "@toolgrain/http";
import { server } from "./server.js";

const mcp = createHttpHandler(server);
const metadata = createProtectedResourceMetadataHandler(server);

// Called by your hosting platform after host/proxy validation.
export function handle(request: Request) {
  const path = new URL(request.url).pathname;
  if (path === "/mcp") return mcp(request);
  if (path === "/.well-known/oauth-protected-resource/mcp")
    return metadata(request);
  return Promise.resolve(new Response(null, { status: 404 }));
}
```

For `https://api.example.com/mcp`, the inferred resource is
`https://api.example.com/mcp`. Ordinary query parameters are excluded. Paths and
significant trailing slashes are preserved; a root resource uses the origin
without `/`. The metadata handler derives the corresponding endpoint from its
well-known path, so it does not require a prior authenticated request. No global
first-request origin is cached. Metadata, authentication challenges, and token
audience verification use the same resource.

**The hosting application must validate allowed hosts before invoking either
handler and supply the correct public request URL.** `allowedOrigins` controls
the browser's `Origin` header; it is not a host allowlist. A URL reconstructed
from an unchecked `Host` or client-supplied forwarded header is not a trusted
resource identifier. Trusted proxy middleware must reject unexpected hosts and
normalize external scheme, host, and path when proxies rewrite them.

Both adapters accept an optional explicit `resource` override, for example
`jwt({ issuer, resource: "https://api.example.com/mcp" })` or
`clerk({ publishableKey, secretKey, resource: "https://api.example.com/mcp" })`.
Use that when your public canonical URL cannot be supplied by the hosting
platform or when several aliases identify one resource. URLs use HTTPS;
HTTP loopback URLs are accepted for development. Configured auth URLs cannot
contain credentials, query strings, fragments, or whitespace.

For Node, mount `createNodeHttpHandler(server)` and
`createNodeProtectedResourceMetadataHandler(server)` from `@toolgrain/node`
before body parsing. The adapter preserves the actual target, host, port, and
direct TLS scheme. It ignores `Forwarded` and `X-Forwarded-*`; use the explicit
resource override or a normalized Web Request from trusted middleware behind a
rewriting proxy. Applications continue to own TLS, routing, CORS, and shutdown.
The [JWT example](../apps/jwt-example/README.md) demonstrates direct Node HTTP,
host validation, separate metadata routing, and both protocol revisions.

## Request behavior

After endpoint checks, authentication runs before body parsing or tool work.
Credentials must be a bearer token in the `Authorization` header. Query tokens
are rejected; cookies, request `_meta`, and tool arguments do not establish an
identity. Each authenticated request gets its own copied, deeply frozen identity.
Calling another integration's `useAuth` or using a context without auth throws.

| Condition | HTTP status |
| --- | --- |
| Missing or invalid/expired access token | 401, with a resource metadata challenge |
| Malformed bearer credentials or a query token | 400 |
| Provider access denial | 403 |
| Provider/network failure or closed server | 503 |

These HTTP statuses are the same in both protocol eras. Provider diagnostics and
credentials are not returned in authentication responses. Public metadata uses
`Cache-Control: no-store` and is available without a bearer token.

Verification, body reading, and execution share request cancellation and server
shutdown. The server stops waiting if verification cannot be cancelled by the
integration. Shared JWT discovery/key fetches may finish for other requests;
Clerk's backend SDK may finish its in-flight request. Late identities and handler
results are discarded. Tool execution remains cooperatively cancellable.

An auth-configured server rejects `listen(transport)` before starting the
transport: this authorization API is HTTP-only. Stdio servers continue using
their process/environment trust model.

## Custom providers and direct invocation

Integrations implement `AuthProvider<T>` from `@toolgrain/mcp`, with a registered
provider `type` symbol, optional canonical `resource`, nonempty
`authorizationServers`, and `verify(token, { resource, signal })`. Return plain
identity data and throw `AuthError` with `invalid_token`, `access_denied`, or
`temporarily_unavailable` as appropriate. `createAuthAccessor<T>(type)` creates a
typed accessor returning recursively readonly identity data. Matching compatible
package copies share provider/context symbols.

The HTTP adapters call `server.authorize(token, { resource, signal? })`, then pass
the opaque scope to `server.handle(message, { auth: scope, protocolVersion? })`.
Custom transport integrations must dispose the scope in `finally`. Scopes are
single-use, server-bound, and cannot be fabricated or reused after disposal.
Calling `handle` without a valid scope on a protected server is rejected.
`getAuthMetadata()` returns copied configuration for HTTP adapters.

`toolContext()` creates an unauthenticated context. Directly calling a tool's raw
`execute` bypasses server authorization and validation; test protected execution
through `authorize` and `handle` instead.

Generic context providers and their agreed lazy dependency resolution remain a
separate feature. Authorization is eagerly verified; `useAuth(ctx)` does no work.
