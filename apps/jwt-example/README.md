# JWT authorization example

A standalone `whoAmI` tool, protected Node HTTP endpoint, public resource
metadata, and automatic issuer/JWKS discovery. No MCP SDK dependency.

From the repository root, run `bun install --frozen-lockfile` and `bun run build`.
Then:

```sh
cd apps/jwt-example
JWT_ISSUER=https://your-provider.example.com bun run dev
```

The example listens at `http://127.0.0.1:3006/mcp` (override `PORT`), with public
metadata at `/.well-known/oauth-protected-resource/mcp`. It accepts only matching
loopback Host headers. Its default issuer is a placeholder so root development
can start every app; set `JWT_ISSUER` to verify real tokens. Your provider must
issue OAuth access tokens for the MCP endpoint's resource/audience.

`bun run build` compiles; `bun run start` runs the compiled Node server.
`bun run test:examples` starts a compiled process and a local signing-key metadata
fixture, verifying signed token calls, challenges, audience rejection, public
metadata, and host validation in both MCP protocol revisions. The fixture does
not implement login or a token-issuance service.

This example listens directly over loopback HTTP. For deployment behind TLS or a
rewriting proxy, supply a normalized public request URL through trusted middleware
or set `MCP_RESOURCE` to the canonical external URL. See
[authorization](../../docs/authorization.md) for the hosting contract and Clerk's
equivalent API.
