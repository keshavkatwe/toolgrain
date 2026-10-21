# Elysia on Bun example

This is an independent application with its own dependencies and native development workflow.

From the repository root, install dependencies and build Toolgrain first:

```sh
bun install --frozen-lockfile
bun run build
cd apps/elysia-example
bun run dev
```

The development endpoint is `http://127.0.0.1:3003/mcp`.
For a production-style run inside this directory:

```sh
bun run build
bun run start
```

The start command defaults to port 3003; set `PORT` to override it.

| Script | Native command |
| --- | --- |
| `dev` | `bun --watch run src/index.ts` |
| `build` | `bun build --target=bun --outdir=dist src/index.ts` |
| `start` | `bun run dist/index.js` |

`src/app.ts` uses Elysia's `.mount(handler)` at the root so its body parser does not consume MCP input. `src/index.ts` calls `.listen()` on Bun; The MCP server is defined in `src/app.ts`, and the reusable greeting tool lives in `src/greet.ts`. Both development and production run on Bun.

The app imports Toolgrain's compiled workspace packages. Root `bun run dev` watches
those packages and runs every example's own development command; HTTP development
ports are distinct. Running only this app's `dev` command does not rebuild Toolgrain.

## Testing

```sh
bun run build
bun run test
```

The smoke test starts this app's actual `start` command on an available loopback
port, checks discovery, tool listing and greet execution, and stops the process.
There is no code coverage instrumentation or coverage floor for example apps.
Root `bun run test:examples` builds and tests all examples. CI runs that separately
from library coverage and retains each workspace's test report.

The MCP revision is `2026-07-28`, with JSON responses. Clients must send the
protocol metadata and mirrored headers. A present browser Origin requires an
explicit `allowedOrigins` setting; configure CORS and authentication in the app.
SSE remains separate work. Optional JWT/Clerk authorization and automatic public
metadata are described in [authorization](../../docs/authorization.md). Toolgrain
packages are private workspace packages, so this example currently runs from this
repository.

## MCP Inspector

Start this app with `bun run dev`, then open another terminal in this directory:

```sh
bun run inspect
```

This launches Inspector 2.11.0 in modern protocol mode against this app's development
endpoint. Connect, list tools, and call `greet` with `{ "name": "Ada" }`.
The Inspector script connects to an already running app; it does not start it.

For a different port or production URL, override the endpoint:

```sh
bun run inspect http://127.0.0.1:4000/mcp
```

## Clerk authorization and Inspector

This workspace also has a protected entry point with `greet` and `whoAmI` tools.
The protected variant uses `@toolgrain/clerk`, and `whoAmI` reads the inferred,
verified identity through `useAuth(ctx)`. Both tools require an OAuth access token.
It listens on `http://127.0.0.1:3007/mcp`, so it can run alongside the regular
example. Root `bun run dev` continues to start the regular example on port 3003.

### Configure the server

From this directory, create `.env.local` using `.env.example` as a template:

```dotenv
CLERK_PUBLISHABLE_KEY=pk_test_your_publishable_key
CLERK_SECRET_KEY=sk_test_your_secret_key
```

Use keys from the same Clerk app and environment's **API keys** page. Bun loads
`.env.local` when these scripts run from this workspace. The file is ignored by
Git. The Clerk entry point refuses to start if either key is missing; it never
falls back to a public endpoint. Issuer and signing-key discovery come from the
publishable key; no issuer/JWKS configuration is needed. The resource is inferred
from the endpoint URL.

Start the server, then Inspector in a second terminal in this directory:

```sh
bun run dev:clerk
```

```sh
bun run inspect:clerk
```

For a compiled run, use `bun run build` and `bun run start:clerk`. Set `PORT` to
change the server's port, then pass the matching endpoint to the Inspector:

```sh
bun run inspect:clerk http://127.0.0.1:4000/mcp
```

### Configure Clerk's OAuth client

The server keys above identify your Clerk instance. Inspector is a separate
OAuth client and needs an OAuth application in that same instance:

1. Open Inspector's **Server Settings → OAuth Settings** and copy its exact
   **Redirect URI**. The default is `http://127.0.0.1:6274/oauth/callback`, but
   use the displayed value, including the host and port.
2. In Clerk Dashboard **OAuth applications**, create an application for Inspector.
   Configure that redirect URI, enable **Public** and **Require PKCE**, and allow
   the `openid` and `profile` scopes.
3. Copy the OAuth application's **Client ID** into Inspector's **Client ID**
   field. Set Inspector's scopes to `openid profile`. A public client needs no
   client secret. The Clerk `sk_...` key belongs only in the server's `.env.local`.
4. Connect in Inspector. The server returns a discovery challenge, Inspector
   follows the public metadata to Clerk, and Clerk presents sign-in and consent.
5. After connecting, list tools. Call `whoAmI` with `{}` to see `userId`,
   `clientId`, and `scopes`; call `greet` with `{ "name": "Ada" }`.

Use `http://127.0.0.1:3007/mcp` consistently. Switching to `localhost` changes the
resource/audience. The adapter accepts Clerk OAuth access tokens for this
resource; Clerk session tokens and OIDC ID tokens are not accepted.
An existing OAuth access token can also be supplied through Inspector's
**Headers** setting as `Authorization: Bearer <access-token>`.

These steps use a manually registered public client; enabling dynamic client
registration is not required. See [Clerk OAuth configuration](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth)
and [Inspector authorization](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector/authorization)
for the client and callback settings.

The public protected-resource metadata is at
`http://127.0.0.1:3007/.well-known/oauth-protected-resource/mcp`.
Requests without valid authorization receive 401; public metadata remains
available before login. This example binds to loopback. For deployment/proxy
configuration, see the [authorization guide](../../docs/authorization.md).

The automated Clerk example tests use signed JWTs and mocked Clerk backend
responses, with no live keys. A live Inspector login requires your Clerk app and
OAuth client configuration.
