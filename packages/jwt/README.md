<a href="https://github.com/keshavkatwe/toolgrain#readme">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/keshavkatwe/toolgrain/main/brand/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/keshavkatwe/toolgrain/main/brand/logo-light.svg">
    <img src="https://raw.githubusercontent.com/keshavkatwe/toolgrain/main/brand/logo-light.svg" alt="Toolgrain" width="200" height="48">
  </picture>
</a>

# @toolgrain/jwt

**Protect your MCP endpoint with JWT.**

Verify OAuth access tokens before tool execution, then read typed, immutable
claims inside your handlers.

[Documentation](https://github.com/keshavkatwe/toolgrain/blob/main/docs/authorization.md) ·
[Examples](https://github.com/keshavkatwe/toolgrain/blob/main/apps/README.md) ·
[npm](https://www.npmjs.com/package/@toolgrain/jwt)

## Installation

Install matching stable versions across Toolgrain libraries. These commands
resolve npm's `latest` tag.

```sh
npm install @toolgrain/jwt @toolgrain/mcp @toolgrain/node zod@^4.6.6
```

## Protect an HTTP server

```ts
import { jwt, useAuth } from "@toolgrain/jwt";
import { createServer, tool } from "@toolgrain/mcp";
import { http } from "@toolgrain/node";
import { z } from "zod";

const server = createServer({
  name: "protected-server",
  version: "1.0.0",
  auth: jwt({ issuer: "https://auth.example.com" }),
  tools: {
    whoAmI: tool({
      input: z.object({}),
      execute(_input, ctx) {
        const { claims } = useAuth(ctx);
        return { subject: claims.sub ?? null };
      },
    }),
  },
});

await server.listen(http({ port: 3000 }));
```

Replace the issuer with your OAuth authorization server. Clients send access
tokens in the Bearer authorization header. Verification runs before body parsing
and tool work. The synchronous `useAuth(ctx)` accessor returns a copied, deeply
frozen identity. Configure application shutdown to call `server.close()`.

Discover signing keys from a trusted issuer; optional `jwksUrl`, `resource`, and
`algorithms` override the defaults. Resource inference uses the validated public
HTTP request URL. Standard claims are typed; custom claims remain unknown.
Requires a signed access token with matching issuer/audience and valid expiration.
This integration verifies tokens and does not implement an OAuth server.

The HTTP adapters infer the resource from the validated public request URL and
serve protected-resource metadata. Configure exact production `allowedHosts`
and normalize proxy URLs through trusted application middleware. Missing or
mismatched audiences return `invalid_token` with public configuration guidance.
Expected auth rejections remain public; unexpected provider failures reach the
server's optional `onError` callback without revealing credentials.

See the
[authorization guide](https://github.com/keshavkatwe/toolgrain/blob/main/docs/authorization.md)
for HTTP mounting, metadata, host/proxy requirements, and issuer configuration.

## Requirements

ESM only. Node.js `^24.20.0` or Bun `>=1.4.4 <2`; Zod `^4.6.6` through MCP;
TypeScript 5.5.4 or later with `strict` enabled. The Node example also needs
TypeScript and `@types/node` as development dependencies. See the
[support policy](https://github.com/keshavkatwe/toolgrain/blob/main/docs/support-policy.md).

## License

MIT License, copyright 2026 Keshav Katwe. See the
[license text](https://github.com/keshavkatwe/toolgrain/blob/main/packages/jwt/LICENSE).
Third-party dependencies retain their own licenses.
